package de.ruether.go;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.WindowManager;
import androidx.annotation.NonNull;
import androidx.core.location.LocationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.common.GoogleApiAvailability;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.CommonStatusCodes;
import com.google.android.gms.nearby.Nearby;
import com.google.android.gms.nearby.connection.AdvertisingOptions;
import com.google.android.gms.nearby.connection.ConnectionInfo;
import com.google.android.gms.nearby.connection.ConnectionLifecycleCallback;
import com.google.android.gms.nearby.connection.ConnectionResolution;
import com.google.android.gms.nearby.connection.ConnectionsClient;
import com.google.android.gms.nearby.connection.ConnectionsStatusCodes;
import com.google.android.gms.nearby.connection.DiscoveredEndpointInfo;
import com.google.android.gms.nearby.connection.DiscoveryOptions;
import com.google.android.gms.nearby.connection.EndpointDiscoveryCallback;
import com.google.android.gms.nearby.connection.Payload;
import com.google.android.gms.nearby.connection.PayloadCallback;
import com.google.android.gms.nearby.connection.PayloadTransferUpdate;
import com.google.android.gms.nearby.connection.Strategy;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Zusammen spielen ohne Internet: Google Nearby Connections (Bluetooth/BLE/WLAN-Direct),
 * genau eine Verbindung, Nachrichten als JSON-Text (UTF-8). Spec v11 §1.1.
 * Alles Zustandsbehaftete läuft auf dem Main-Thread (dort kommen auch die Nearby-Callbacks an).
 */
@CapacitorPlugin(
    name = "NearbyLink",
    permissions = {
        @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }),
        @Permission(
            alias = "bluetooth",
            strings = { Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_ADVERTISE, Manifest.permission.BLUETOOTH_CONNECT }
        ),
        @Permission(alias = "wifi", strings = { Manifest.permission.NEARBY_WIFI_DEVICES }),
    }
)
public class NearbyLinkPlugin extends Plugin {

    private static final String SERVICE_ID = "de.ruether.go";
    private static final Strategy STRATEGY = Strategy.P2P_POINT_TO_POINT;
    private static final int RETRIES = 3; // requestConnection: bis zu 3× neu versuchen …
    private static final long RETRY_MS = 1500; // … jeweils nach 1,5 s

    private final Handler main = new Handler(Looper.getMainLooper());
    private final Map<String, String> names = new HashMap<>(); // Endpunkt-id → Spitzname
    private final Map<String, String> codes = new HashMap<>(); // Endpunkt-id → Bestätigungscode
    private ConnectionsClient client;
    private String myName = "Rüther";
    private String wantPeer; // join: nur mit diesem Gastgeber verbinden (null = dem ersten)
    private String endpoint; // verbundener Endpunkt
    private String pending; // Endpunkt, mit dem gerade verbunden wird
    private boolean asking; // Berechtigungsdialog ist offen
    private boolean locationAsked; // Android 13+: Standort schon einmal nachgefragt (nur ein Versuch je App-Lauf)
    private boolean joining; // sucht gerade (Beitreten): nach einem gescheiterten Verbinden die Suche neu anstoßen
    private int round; // zählt stopAll(): alte Wiederholungen laufen ins Leere

    // ---------- Methoden für JS ----------

    @PluginMethod
    public void host(PluginCall call) {
        main.post(() -> {
            if (ready(call)) startHost(call);
        });
    }

    @PluginMethod
    public void join(PluginCall call) {
        main.post(() -> {
            if (ready(call)) startJoin(call);
        });
    }

    @PluginMethod
    public void send(PluginCall call) {
        main.post(() -> {
            String data = call.getString("data");
            if (endpoint == null) {
                fail(call, "notconnected");
                return;
            }
            if (data == null) {
                call.reject("data fehlt");
                return;
            }
            byte[] bytes = data.getBytes(StandardCharsets.UTF_8);
            if (bytes.length > ConnectionsClient.MAX_BYTES_DATA_SIZE) {
                fail(call, "toobig");
                return;
            }
            // Die Hülle wartet nicht auf die Zustellung; ihr Herzschlag merkt Verluste.
            client.sendPayload(endpoint, Payload.fromBytes(bytes)).addOnFailureListener(e -> android.util.Log.w("NearbyLink", "send", e));
            call.resolve();
        });
    }

    @PluginMethod
    public void close(PluginCall call) {
        main.post(() -> {
            stopAll();
            asking = false;
            call.resolve();
        });
    }

    @PluginMethod
    public void keepAwake(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        main.post(() -> {
            if (getActivity() != null) {
                if (on) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }
            call.resolve();
        });
    }

    /** Einstellungen öffnen, damit ein Fehler behoben werden kann: to = app (Berechtigungen) | location | bluetooth. */
    @PluginMethod
    public void openSettings(PluginCall call) {
        String to = call.getString("to", "app");
        main.post(() -> {
            Intent i = "location".equals(to)
                ? new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)
                : "bluetooth".equals(to)
                    ? new Intent(Settings.ACTION_BLUETOOTH_SETTINGS)
                    : new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", getContext().getPackageName(), null));
            try {
                getActivity().startActivity(i);
                call.resolve();
            } catch (Exception e) {
                fail(call, "nosettings");
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        stopAll();
    }

    // ---------- Vorbedingungen ----------

    /**
     * Play-Dienste da und alle Berechtigungen erteilt? Sonst ablehnen bzw. erst nachfragen.
     * Veraltete oder abgeschaltete Play-Dienste: Googles eigener Dialog (Aktualisieren/Aktivieren) und Code gmsupdate.
     */
    private boolean ready(PluginCall call) {
        GoogleApiAvailability api = GoogleApiAvailability.getInstance();
        int gms = api.isGooglePlayServicesAvailable(getContext());
        if (gms != ConnectionResult.SUCCESS) {
            boolean fixable = api.isUserResolvableError(gms) && getActivity() != null;
            if (fixable) api.makeGooglePlayServicesAvailable(getActivity());
            fail(call, fixable ? "gmsupdate" : "unavailable");
            return false;
        }
        if (client == null) client = Nearby.getConnectionsClient(getContext());
        String[] missing = missingAliases();
        if (missing.length == 0) return true;
        if (asking) {
            fail(call, "busy");
            return false;
        }
        asking = true;
        requestPermissionForAliases(missing, call, "permsDone");
        return false;
    }

    @PermissionCallback
    private void permsDone(PluginCall call) {
        asking = false;
        if (missingAliases().length > 0) fail(call, "permission");
        else if ("join".equals(call.getMethodName())) startJoin(call);
        else startHost(call);
    }

    /**
     * Benötigte Aliase je Android-Version, davon die noch fehlenden. Ab Android 13 ohne Standort: BLUETOOTH_SCAN und
     * NEARBY_WIFI_DEVICES tragen im Manifest neverForLocation (wie Googles Beispiel WalkieTalkie); bis Android 12 braucht
     * Nearby den genauen Standort (Strategy-Referenz: FINE zwischen Q und S).
     */
    private String[] missingAliases() {
        int sdk = Build.VERSION.SDK_INT;
        String[] need = sdk >= 33
            ? new String[] { "bluetooth", "wifi" }
            : sdk >= 31 ? new String[] { "bluetooth", "location" } : new String[] { "location" };
        List<String> missing = new ArrayList<>();
        for (String a : need) if (getPermissionState(a) != PermissionState.GRANTED) missing.add(a);
        return missing.toArray(new String[0]);
    }

    // ---------- Rollen ----------

    private void startHost(PluginCall call) {
        myName = call.getString("name", myName);
        stopAll();
        AdvertisingOptions opts = new AdvertisingOptions.Builder().setStrategy(STRATEGY).build();
        client
            .startAdvertising(myName, SERVICE_ID, lifecycle, opts)
            .addOnSuccessListener(v -> call.resolve())
            .addOnFailureListener(e -> {
                if (status(e) == ConnectionsStatusCodes.STATUS_ALREADY_ADVERTISING) call.resolve();
                else if (!locationFallback(e, call)) fail(call, codeOf(e));
            });
    }

    /**
     * Android 13+: Verlangt Nearby trotz neverForLocation doch den Standort (ältere Play-Dienste melden
     * MISSING_PERMISSION_ACCESS_*_LOCATION), wird er einmal nachgefragt; permsDone startet dann neu. true = übernommen.
     */
    private boolean locationFallback(Exception e, PluginCall call) {
        if (Build.VERSION.SDK_INT < 33 || asking || locationAsked || !message(e).startsWith("MISSING_PERMISSION_ACCESS")) return false;
        if (getPermissionState("location") == PermissionState.GRANTED) return false;
        asking = true;
        locationAsked = true;
        requestPermissionForAliases(new String[] { "location" }, call, "permsDone");
        return true;
    }

    private void startJoin(PluginCall call) {
        myName = call.getString("name", myName);
        String peer = call.getString("peer");
        stopAll();
        // Bis Android 12 braucht Suchen den eingeschalteten Standort (Nearby meldet sonst nur MISSING_PERMISSION_ACCESS_COARSE_LOCATION)
        if (Build.VERSION.SDK_INT < 33 && !locationOn()) {
            fail(call, "location");
            return;
        }
        wantPeer = peer == null || peer.isEmpty() ? null : peer;
        joining = true;
        client
            .startDiscovery(SERVICE_ID, discovery, discoveryOptions())
            .addOnSuccessListener(v -> call.resolve())
            .addOnFailureListener(e -> {
                if (status(e) == ConnectionsStatusCodes.STATUS_ALREADY_DISCOVERING) call.resolve();
                else if (!locationFallback(e, call)) fail(call, codeOf(e));
            });
    }

    private static DiscoveryOptions discoveryOptions() {
        return new DiscoveryOptions.Builder().setStrategy(STRATEGY).build();
    }

    private boolean locationOn() {
        LocationManager lm = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
        return lm == null || LocationManagerCompat.isLocationEnabled(lm);
    }

    /**
     * Verbinden ist gescheitert: Nearby meldet einen weiter sichtbaren Gastgeber nicht noch einmal (onEndpointFound kommt je Suche
     * einmal), also nach RETRY_MS die Suche neu starten. Dann wird er wieder gefunden und angesteuert („ich versuche es weiter“).
     */
    private void rediscover() {
        if (!joining) return;
        int r = round;
        main.postDelayed(
            () -> {
                if (r != round || !joining || endpoint != null || pending != null) return;
                client.stopDiscovery();
                client
                    .startDiscovery(SERVICE_ID, discovery, discoveryOptions())
                    .addOnFailureListener(e -> {
                        if (r == round && status(e) != ConnectionsStatusCodes.STATUS_ALREADY_DISCOVERING) emitError(codeOf(e), message(e));
                    });
            },
            RETRY_MS
        );
    }

    /** Werben, Suchen und Verbindung beenden; ausstehende Wiederholungen verwerfen. */
    private void stopAll() {
        round++;
        if (client != null) {
            client.stopAdvertising();
            client.stopDiscovery();
            client.stopAllEndpoints();
        }
        endpoint = null;
        pending = null;
        wantPeer = null;
        joining = false;
        names.clear();
        codes.clear();
    }

    private void connect(String id, int attempt) {
        int r = round;
        pending = id;
        client
            .requestConnection(myName, id, lifecycle)
            .addOnFailureListener(e -> {
                if (r != round || !id.equals(pending)) return; // inzwischen abgebrochen
                if (status(e) == ConnectionsStatusCodes.STATUS_ALREADY_CONNECTED_TO_ENDPOINT) return;
                if (attempt < RETRIES) {
                    main.postDelayed(
                        () -> {
                            if (r == round && id.equals(pending) && endpoint == null) connect(id, attempt + 1);
                        },
                        RETRY_MS
                    );
                } else {
                    pending = null;
                    // immer connect: STATUS_RADIO_ERROR heißt hier „Funkverbindung gescheitert“, nicht „Bluetooth aus“
                    emitError("connect", message(e));
                    rediscover(); // weiter suchen, derselbe Gastgeber wird neu gemeldet
                }
            });
    }

    // ---------- Nearby-Callbacks (Main-Thread) ----------

    private final EndpointDiscoveryCallback discovery = new EndpointDiscoveryCallback() {
        @Override
        public void onEndpointFound(@NonNull String id, @NonNull DiscoveredEndpointInfo info) {
            String name = info.getEndpointName();
            JSObject ev = new JSObject();
            ev.put("id", id);
            ev.put("name", name);
            notifyListeners("peerFound", ev);
            if (endpoint == null && pending == null && (wantPeer == null || wantPeer.equals(name))) {
                // Suchen ist schwere Funkarbeit und stört den Verbindungsaufbau (Nearby-Doku, Beispiel WalkieTalkie);
                // scheitert das Verbinden, startet rediscover() die Suche neu
                client.stopDiscovery();
                connect(id, 0);
            }
        }

        @Override
        public void onEndpointLost(@NonNull String id) {}
    };

    private final ConnectionLifecycleCallback lifecycle = new ConnectionLifecycleCallback() {
        @Override
        public void onConnectionInitiated(@NonNull String id, @NonNull ConnectionInfo info) {
            if (endpoint != null) { // genau eine Verbindung
                client.rejectConnection(id);
                return;
            }
            // Auto-Accept: beide Seiten zeigen den Code, keine Rückfrage
            names.put(id, info.getEndpointName());
            codes.put(id, info.getAuthenticationDigits());
            client.acceptConnection(id, payloads);
        }

        @Override
        public void onConnectionResult(@NonNull String id, @NonNull ConnectionResolution res) {
            if (res.getStatus().isSuccess()) {
                if (endpoint != null && !endpoint.equals(id)) {
                    client.disconnectFromEndpoint(id);
                    return;
                }
                client.stopAdvertising();
                client.stopDiscovery();
                endpoint = id;
                pending = null;
                joining = false;
                JSObject ev = new JSObject();
                ev.put("id", id);
                ev.put("name", names.get(id));
                ev.put("code", codes.get(id));
                notifyListeners("connected", ev);
            } else {
                boolean mine = id.equals(pending);
                if (mine) pending = null;
                names.remove(id);
                codes.remove(id);
                if (!mine) return; // nur wer angefragt hat, meldet und sucht weiter (der Gastgeber wirbt ohnehin weiter)
                emitError("connect", ConnectionsStatusCodes.getStatusCodeString(res.getStatus().getStatusCode()));
                rediscover();
            }
        }

        @Override
        public void onDisconnected(@NonNull String id) {
            names.remove(id);
            codes.remove(id);
            if (!id.equals(endpoint)) return;
            endpoint = null;
            JSObject ev = new JSObject();
            ev.put("id", id);
            notifyListeners("disconnected", ev);
        }
    };

    private final PayloadCallback payloads = new PayloadCallback() {
        @Override
        public void onPayloadReceived(@NonNull String id, @NonNull Payload p) {
            if (p.getType() != Payload.Type.BYTES || p.asBytes() == null) return;
            JSObject ev = new JSObject();
            ev.put("id", id);
            ev.put("data", new String(p.asBytes(), StandardCharsets.UTF_8));
            notifyListeners("message", ev);
        }

        @Override
        public void onPayloadTransferUpdate(@NonNull String id, @NonNull PayloadTransferUpdate u) {}
    };

    // ---------- Fehler ----------

    private static int status(Exception e) {
        return e instanceof ApiException ? ((ApiException) e).getStatusCode() : -1;
    }

    private static String message(Exception e) {
        int s = status(e);
        return s >= 0 ? ConnectionsStatusCodes.getStatusCodeString(s) : String.valueOf(e.getMessage());
    }

    /** Nearby-Status → Fehlercode der Spec: permission | bluetooth | location | unavailable | busy | sonst die Status-Nachricht. */
    private static String codeOf(Exception e) {
        int s = status(e);
        String msg = message(e);
        if (s == ConnectionsStatusCodes.STATUS_RADIO_ERROR) return "bluetooth"; // = STATUS_BLUETOOTH_ERROR (veraltet)
        if (s == ConnectionsStatusCodes.MISSING_SETTING_LOCATION_MUST_BE_ON) return "location";
        if (msg.startsWith("MISSING_PERMISSION")) return "permission";
        if (s == CommonStatusCodes.API_NOT_CONNECTED) return "unavailable";
        if (s == ConnectionsStatusCodes.API_CONNECTION_FAILED_ALREADY_IN_USE) return "busy"; // andere App nutzt Nearby
        return msg;
    }

    /** call.reject: Nachricht und .code tragen beide den Code (JS liest e.code). */
    private static void fail(PluginCall call, String code) {
        call.reject(code, code);
    }

    private void emitError(String code, String message) {
        JSObject ev = new JSObject();
        ev.put("code", code);
        ev.put("message", message);
        notifyListeners("error", ev);
    }
}
