# Rüther GO v11: Zusammen spielen (ohne Internet)

Stand 2026-10-17. Ziel von Sebi: Er und sein Vater sitzen im selben Flugzeug, **ohne WLAN und ohne mobile Daten**, und spielen zusammen:
**(1) Arena-Duell 3 gegen 3**, **(2) Koop-Quest** (dieselbe Quest gemeinsam), **(3) Quest-Rennen** (dieselbe Quest, wer schafft mehr).
Verbindung in der Android-App über **Google Nearby Connections** (Bluetooth/BLE/WLAN-Direct, kein Internet), im Browser zum Testen über **BroadcastChannel** (zwei Fenster).

## §0 Regeln

- Echte Pixel-Gesichter (`sprites/<id>.png`) und Humor sind der Kern. Gesichter werden **nie eingefärbt, ausgegraut oder verdeckt**, auch nicht für K.o. oder „gehört dem Partner“ (dafür Text-Etikett darunter). Pixel-Kneipe-Stil, keine Emojis in Bedienelementen, keine NS-Symbole.
- **`js/data.js` bleibt unverändert.** Neue Konstanten stehen in ihren Modulen (`DUEL` in `js/duel.js`, `RACE` in `js/quest/race.js`, `PROTO`/`TIMING` in `js/net/link.js`).
- Vanilla-JS ohne Build, ES-Module, deutsch kommentiert, Stil wie umgebend. Mobil zuerst: 390×844 und 375×667.
- Nichts committen, pushen, deployen. Lokal offline, nie ins echte ntfy-Topic. Fotos nie committen.
- **Eingehende Nachrichten sind Daten von außen:** jedes Modul prüft Typen und Bereiche (Zahl endlich, Index im Team, id bekannt), unbekannte `t` und kaputtes JSON werden still verworfen. Kampf- und Quest-Werte des Partners werden **nie übernommen, sondern aus `{ id, rarity, level }` neu berechnet** (`makeFighter`).
- Familien-Spiel: keine Anti-Cheat-Maßnahmen über diese Neuberechnung hinaus.

## §1 Transport

### §1.1 Native: Capacitor-Plugin „NearbyLink“

Datei `native/android/app/src/main/java/de/ruether/go/NearbyLinkPlugin.java`, Registrierung in `MainActivity.java`:

```java
public class MainActivity extends BridgeActivity {
  @Override public void onCreate(Bundle savedInstanceState) {
    registerPlugin(NearbyLinkPlugin.class); // lokales Plugin: cap sync findet es nicht von selbst
    super.onCreate(savedInstanceState);
  }
}
```

- Abhängigkeit in `native/android/app/build.gradle`: `implementation "com.google.android.gms:play-services-nearby:19.3.0"`.
- `ConnectionsClient c = Nearby.getConnectionsClient(getContext())`, **Strategy `P2P_POINT_TO_POINT`**, **Service-ID `"de.ruether.go"`**, genau eine Verbindung.
- Endpunktname = Spitzname des Spielers (`name`).
- **Rollen:**
  - `host({ name })`: `stopAll()`, dann `startAdvertising(name, SERVICE_ID, lifecycle, AdvertisingOptions(P2P_POINT_TO_POINT))`.
  - `join({ name, peer? })`: `stopAll()`, dann `startDiscovery(SERVICE_ID, discovery, DiscoveryOptions(P2P_POINT_TO_POINT))`. Jedes `onEndpointFound(id, info)` meldet `peerFound`. Der **erste** gefundene Endpunkt (mit `peer`: nur der mit `info.getEndpointName().equals(peer)`) bekommt sofort `requestConnection(name, id, lifecycle)`. Schlägt das fehl, bis zu 3× nach 1,5 s neu versuchen, dann `error` und weiter suchen: nach 1,5 s `stopDiscovery()` + `startDiscovery()`, denn Nearby meldet einen weiter sichtbaren Gastgeber sonst nie wieder.
  - Vor `startDiscovery` prüft `join`, ob der Standort eingeschaltet ist (`LocationManagerCompat.isLocationEnabled`), sonst `reject('location')`.
- **Auto-Accept mit Bestätigungscode:** `onConnectionInitiated(id, info)` merkt `code = info.getAuthenticationDigits()` (falls das nicht kompiliert: `getAuthenticationToken()`) und `info.getEndpointName()`, ruft sofort `acceptConnection(id, payloadCallback)`. Beide Seiten zeigen den Code, keine Rückfrage.
- `onConnectionResult(id, res)`: OK → `stopAdvertising()`, `stopDiscovery()`, Endpunkt merken, Event `connected { id, name, code }`. Sonst `error { code: 'connect' }`; beim Beitreten weiter suchen (Suche neu starten wie oben).
- `onDisconnected(id)` → Endpunkt vergessen, Event `disconnected { id }`.
- **Payload BYTES mit JSON-Text (UTF-8):**
  - `send({ data })`: ohne Verbindung `reject('notconnected')`. Über `ConnectionsClient.MAX_BYTES_DATA_SIZE` (32 KB) `reject('toobig')`. Sonst `sendPayload(endpoint, Payload.fromBytes(data.getBytes(UTF_8)))`, `resolve()`.
  - `onPayloadReceived`: nur `Payload.Type.BYTES` → Event `message { id, data: new String(bytes, UTF_8) }`.
- `close()`: `stopAdvertising`, `stopDiscovery`, `stopAllEndpoints`, `resolve()`. Dasselbe in `handleOnDestroy()`.
- `keepAwake({ on })`: auf dem UI-Thread `FLAG_KEEP_SCREEN_ON` setzen bzw. löschen. Damit sperrt sich das Handy während einer Runde nicht von selbst.
- **Fehlercodes** (als `call.reject(code)` und im Event `error { code, message }`):
  - `'permission'`: Berechtigung fehlt oder abgelehnt, auch Nearby `MISSING_PERMISSION_*`.
  - `'bluetooth'`: `STATUS_BLUETOOTH_ERROR`.
  - `'location'`: Standort ist aus (`MISSING_SETTING_LOCATION_MUST_BE_ON` bzw. die Prüfung in `join`).
  - `'unavailable'`: keine Google-Play-Dienste (`GoogleApiAvailability`).
  - `'busy'`: läuft schon.
  - `'toobig'`, `'notconnected'`.
  - sonst die Status-Nachricht.
  - `STATUS_ALREADY_ADVERTISING` / `STATUS_ALREADY_DISCOVERING` gelten als Erfolg.

**Berechtigungen Android 8–15** (minSdk 22, target 34). In `AndroidManifest.xml` ergänzen, die vorhandenen Standort-Einträge bleiben unverändert:

```xml
<uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
<uses-permission android:name="android.permission.BLUETOOTH_ADVERTISE" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.NEARBY_WIFI_DEVICES" />
<uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
<uses-permission android:name="android.permission.CHANGE_WIFI_STATE" />
<uses-permission android:name="android.permission.CHANGE_NETWORK_STATE" />
```

Meldet der Manifest-Merger einen Konflikt mit dem Manifest der Nearby-Bibliothek, wird er mit `tools:node="replace"` am betroffenen Eintrag gelöst.

**Laufzeit-Abfrage** im Plugin, vor `host`/`join`:

```java
@CapacitorPlugin(name = "NearbyLink", permissions = {
  @Permission(alias = "location", strings = { ACCESS_FINE_LOCATION, ACCESS_COARSE_LOCATION }),
  @Permission(alias = "bluetooth", strings = { BLUETOOTH_SCAN, BLUETOOTH_ADVERTISE, BLUETOOTH_CONNECT }),
  @Permission(alias = "wifi", strings = { NEARBY_WIFI_DEVICES }),
})
```

Benötigte Aliase je Android-Version:

| Android | SDK | Aliase |
|---|---|---|
| 8–11 | < 31 | `location` |
| 12 | 31–32 | `bluetooth`, `location` |
| 13–15 | ≥ 33 | `bluetooth`, `wifi`, `location` |

`location` auf allen Versionen: Nearby bricht `startDiscovery` auch auf Android 13+ ohne genauen Standort ab (gemessen auf API 36: `8034`/`8036 MISSING_PERMISSION_ACCESS_*_LOCATION`).

Fehlt einer, ruft das Plugin `requestPermissionForAliases(aliases, call, "permsDone")` auf. `@PermissionCallback permsDone(call)` macht dann mit `call.getMethodName()` weiter oder antwortet mit `reject('permission')`.

**JS-Sicht** (ohne `@capacitor/core`: die Bridge legt `window.Capacitor.Plugins.NearbyLink` mit Promise-Methoden und `addListener` an):

```
NearbyLink.host({ name })                 → Promise<void>
NearbyLink.join({ name, peer? })          → Promise<void>
NearbyLink.send({ data: string })         → Promise<void>
NearbyLink.close()                        → Promise<void>
NearbyLink.keepAwake({ on: boolean })     → Promise<void>
NearbyLink.addListener('peerFound',    ({ id, name }) => …)
NearbyLink.addListener('connected',    ({ id, name, code }) => …)
NearbyLink.addListener('disconnected', ({ id }) => …)
NearbyLink.addListener('message',      ({ id, data }) => …)
NearbyLink.addListener('error',        ({ code, message }) => …)
```

### §1.2 JS-Schicht `js/net/link.js`

Eine gemeinsame Hülle (Hallo, Herzschlag, Zerlegen, Wiederverbinden, Events) über zwei kleine Transporte (`nearby`, `local`). Beide reichen Rohtext durch: `start(role, name, peer)`, `send(str)`, `stop()`, gemeldet werden `found`, `up(name, code)`, `down`, `data(str)` und `error(code)`.

```js
export const PROTO = 1; // erhöhen bei jeder inkompatiblen Änderung an Link-, Duell- oder Quest-Nachrichten
export const TIMING = { PING_MS: 2000, TIMEOUT_MS: 6000, RECONNECT_MS: 60_000, ADV_MS: 1000 };
// dazu intern RETRY_MS = 3000 (per timing überschreibbar): Neustart des Transports im Zustand 'lost'
export function pickKind(); // 'nearby', wenn window.Capacitor?.isPluginAvailable?.('NearbyLink'), sonst 'local'
export function createLink({ kind = pickKind(), plugin, channel = 'ruether-go-link', lag = 0, timing } = {}) → Link
```

- `plugin`: Ersatz für `Capacitor.Plugins.NearbyLink` (Tests).
- `channel`: Name des BroadcastChannel (Tests).
- `lag`: künstliche Verzögerung in ms, nur bei `local` (Playtest `?lag=150`).
- `timing`: überschreibt `TIMING` (Tests).

```
Link = {
  kind: 'nearby'|'local', role: 'host'|'guest'|null,
  state: 'idle'|'hosting'|'joining'|'connected'|'lost'|'closed',
  peer: { name } | null, code: string | null,   // code: 4 Ziffern zum Vergleichen
  host(name) → Promise<void>,   // wirbt an; rejects Error mit .code (wie §1.1)
  join(name) → Promise<void>,   // sucht, verbindet sich automatisch mit dem ersten Gastgeber
  send(obj)  → boolean,         // false, wenn gerade nicht 'connected' (Nachricht verworfen)
  on(type, fn) → off(),         // mehrere Hörer je Typ
  close()    → Promise<void>,   // schickt 'bye', state 'closed'
  keepAwake(on) → void,         // nearby: Plugin, local: nichts
}
```

**Events:**

| Event | Daten | Bedeutung |
|---|---|---|
| `'state'` | neuer Zustand | Zustand hat sich geändert |
| `'peerFound'` | `{ name }` | Gastgeber gefunden (nur beim Beitreten) |
| `'connected'` | `{ name, code, again }` | erst **nach** dem Hallo-Abgleich. `again`: dieselbe Gegenseite (gleiche `sid`) ist nach `lost` zurück |
| `'lost'` | `{ reason: 'timeout'\|'native' }` | Verbindung weg; die Hülle verbindet neu (Gastgeber wirbt wieder an, Gast sucht nur nach `peer.name`): bei `native` sofort, bei `timeout` nach weiteren `RETRY_MS` Funkstille; schlägt ein Neustart fehl, alle `RETRY_MS` erneut (der Fehler kommt nur einmal als `error`), bis `RECONNECT_MS` um ist |
| `'disconnected'` | `{ reason: 'left'\|'timeout'\|'version'\|'closed' }` | endgültig: Partner hat `bye` geschickt, `RECONNECT_MS` ist abgelaufen, die Version passt nicht oder `close()` lief |
| `'message'` | Nachrichtenobjekt | jede App-Nachricht |
| `'error'` | `{ code, message }` | nativer Fehler; state geht zurück auf `'idle'` |

**Protokoll der Hülle** (reservierte `t`, Apps sehen sie nie):

- `{ t: 'hello', v: PROTO, name, sid }` schickt jede Seite sofort beim nativen „up“. `sid` ist pro Link-Instanz zufällig.
  - Anderes `v` → `disconnected { reason: 'version' }` auf beiden Seiten.
  - Andere `sid` als vorher (Partner-App neu gestartet) → erst `disconnected { reason: 'closed' }`, dann `connected { again: false }`.
- `{ t: 'ping' }` geht alle `PING_MS`, wenn seitdem nichts gesendet wurde. Jede empfangene Nachricht zählt als Lebenszeichen. Fehlt `TIMEOUT_MS` lang jedes → `lost { reason: 'timeout' }`. Kommt danach wieder etwas → `connected { again: true }`.
- `{ t: 'bye' }` beim `close()` und bei `pagehide`.
- `{ t: '_part', id, k, n, d }`: Texte über 8000 Zeichen zerlegt `send` in Teile (8000 Zeichen sind auch bei UTF-8 unter 32 KB), der Empfänger setzt sie zusammen.
- Alles wird als JSON-Text verschickt. Die Hülle setzt kein Feld in App-Nachrichten.

**Transport `local` (BroadcastChannel):** Nachrichten `{ k, from, to?, … }`, `from` ist eine zufällige Instanz-id.

| `k` | Richtung | Inhalt |
|---|---|---|
| `adv` | Host → alle | `{ name }`, alle `ADV_MS`, solange nicht verbunden |
| `req` | Gast → Host | `{ to, name }` |
| `acc` | Host → Gast | `{ to, code }` (Host würfelt 4 Ziffern) |
| `msg` | beide | `{ to, data }` (`data` = derselbe JSON-Text wie bei nearby) |
| `bye` | beide | `{ to }` |

Nachrichten mit fremdem `to` werden ignoriert. Der Host nimmt nur den ersten `req`.

## §2 Lobby „Zusammen spielen“

**Einstieg:** Profil-Screen, neuer Knopf „Zusammen spielen“ (Icon `profile`) unter „Shop / Teilen“, Untertitel „Ohne Internet, über Bluetooth. Geht auch im Flieger.“. Braucht nur `save.profile`. Gesperrt mit Toast, solange eine Haunebu-Flugsequenz oder Quest läuft („Erst landen.“).

**Screen** `#screen-lobby` (ohne Tab-Leiste). Logik in `js/lobby.js`, Styles in `css/screens.css`. Ablauf:

1. **Start:** Zwei große Knöpfe, „Spiel eröffnen“ (Host) und „Beitreten“ (Gast). Dazu ein Hinweis je Transport:
   - nearby: „Bluetooth und Standort einschalten, das geht auch im Flugmodus. Zum Beitreten braucht Android den Standort.“
   - local: „Testmodus: das Spiel in einem zweiten Fenster öffnen (?slot=2).“
   - Vor der ersten Android-Abfrage ein Popup: „Android fragt gleich nach ‚Geräte in der Nähe‘. Damit findet ihr euch ohne Internet.“
2. **Warten/Suchen:** „Warte auf Mitspieler …“ bzw. „Suche Spiel …“, Knopf „Abbrechen“. Findet der Gast 30 s lang nichts: „Nichts gefunden. Hat dein Gegenüber auf ‚Spiel eröffnen‘ getippt? Bluetooth an?“, die Suche läuft weiter.
3. **Verbunden:**
   - Beide Spieler stehen nebeneinander: echtes Avatar-Gesicht (`sprites/<avatar>.png` im Seltenheitsrahmen `r-normal`), Spitzname, Trainer-Level.
   - Darunter „Code 4711, steht bei euch beiden dasselbe?“ und der Knopf „Trennen“.
   - Sofort tauschen beide `me` aus. Abweichendes `version` → gelber Hinweis „Ihr habt verschiedene Versionen (v11 / v10). Lieber beide aktualisieren.“, spielen geht trotzdem. Ein harter Abbruch kommt nur über `PROTO` (§1.2).
4. **Modus wählen** (nur der Host, der Gast sieht die Wahl live, `mode`). Drei Karten:
   - „Arena-Duell 3 gegen 3: Wer zuerst pleite ist, zahlt die nächste Runde Dosenbier.“
   - „Koop-Quest: Zusammen rein, zusammen raus. Jeder steuert bis zu 2 Rüther.“
   - „Quest-Rennen: Dieselbe Mission, dieselbe Karte. Wer mehr schafft, kriegt den Bonus.“
   - Für die Quest-Modi zusätzlich eine Missionsliste. Koop zeigt nur Missionen ohne `solo`, das Rennen alle.
   - **Quest-Modi brauchen weder Haunebu noch freigeschaltete Quests** („Ihr sitzt ja schon im Flieger.“).
5. **Team-Wahl** je Spieler aus der **eigenen** Sammlung, Raster aus echten Gesichtern mit Seltenheitsrahmen und Level, vorbelegt mit `save.team` (ein Moduswechsel kürzt nur, was gerade gilt; zurück im Duell sind wieder alle 3 da):
   - Duell: 1–3, Standard 3.
   - Koop: 1–2.
   - Rennen: 1–3. Bei einer `solo`-Mission wählt das Spiel automatisch das stärkste Exemplar (wie `soloInst`). Fehlt es, kommt `pick { ready: false, missing: '<id>' }` und beide sehen „Papa hat noch keinen Viktor.“
   - In Quest-Modi wird je Rüther `loadoutFor(save, id)` mitgeschickt. Ausrüsten geht in der Sammlung, nicht in der Lobby.
   - Die Teams beider Spieler sind für beide sichtbar.
6. **Bereit:** Jeder tippt „Bereit“. Jede Änderung an Team, Modus oder Mission setzt „Bereit“ zurück. Sind beide bereit und beide Teams gültig, schaltet der Host „Start“ frei. Der Host würfelt `setup = pickSetup(m, Math.random)` und `seed`, schickt `start` und beide wechseln in den Modus.
7. **Nach dem Modus** zurück in die Lobby, verbunden. Picks bleiben, „Bereit“ ist aus. „Nochmal“ heißt einfach wieder Bereit + Start.

`link.keepAwake(true)` beim Betreten der Lobby, `false` beim Verlassen. Die Lobby hört auf `visibilitychange` und schickt `away` bzw. `back` (§6).

**Abbruch-Fälle in der Lobby:**

| Fall | Anzeige / Verhalten |
|---|---|
| Berechtigung abgelehnt | „Ohne ‚Geräte in der Nähe‘ und genauen Standort geht es nicht. In den Android-Einstellungen bei Rüther GO erlauben.“ Zurück zu 1 |
| `bluetooth` | „Bluetooth einschalten (geht auch im Flugmodus).“ Zurück zu 1 |
| `location` | „Standort einschalten (geht auch im Flugmodus). Ohne findet Android das andere Handy nicht.“ Zurück zu 1 |
| Fehler beim Wiederverbinden oder im Spiel | nur als Toast, kein Popup über Duell oder Quest |
| `unavailable` | „Auf diesem Handy fehlen die Google-Play-Dienste.“ |
| Partner verlässt die Lobby (`leave` oder `disconnected left`) | Toast „<Name> hat die Lobby verlassen.“ Host: zurück zu 2 (wirbt weiter an). Gast: zurück zu 1 |
| `lost` | Banner „Verbindung weg, verbinde neu …“, nach `disconnected` wie oben |
| `disconnected version` | Popup „Unterschiedliche Spielversionen. Beide die neueste App installieren.“ |
| Zurück-Taste / „Trennen“ | `leave`, `link.close()`, zurück zum Profil |

**Lobby-Nachrichten:**

```
{ t: 'me',    name, avatar, level, version }                    beide
{ t: 'mode',  mode: 'duel'|'coop'|'race', missionId|null }      Host → Gast
{ t: 'pick',  team: Pick[], ready: boolean, missing?: id }      beide
{ t: 'start', mode, missionId|null, setup|null, seed,
              teams: { host: Pick[], guest: Pick[] },
              names: { host: { name, avatar }, guest: { name, avatar } } }   Host → Gast
{ t: 'leave' } · { t: 'away' } · { t: 'back' }                  beide
Pick = { uid, id, rarity, level, loadout: Loadout|null }        // Loadout wie loadoutFor()
```

**Kämpfer aus Picks**, auf beiden Geräten gleich: unbekannte `id` → verwerfen, unbekannte `rarity` → `'normal'`, `level` auf 1–20 begrenzen, dann `makeFighter(RUETHER_BY_ID[p.id], p)`. Quest-Modi ergänzen `loadout` und (Koop) `owner`.

## §3 Arena-Duell 3 gegen 3

### §3.1 Engine `js/duel.js` (rein, ohne DOM, ohne Zufall, deterministisch)

```js
export const DUEL = {
  DURATION: 90_000, WARN: 1000, HP_MULT: 2, STEP: 50, SEND_MS: 100, MIN_REWARD_MS: 30_000,
  LAG_MAX: 400, STUN_SAFE: 2000,
  REWARD: { win: { sats: 300, xp: 150 }, lose: { sats: 100, xp: 50 }, draw: { sats: 150, xp: 75 } },
};
export function createDuel({ a, b, duration = DUEL.DURATION }) → DuelState   // a, b: je 1–3 makeFighter-Werte
export function tickDuel(s, dt, inputs = {}) → DuelEvent[]                    // inputs = { a?: Input, b?: Input }
export function endDuel(s, winner, reason) → DuelEvent[]                      // für 'lost' (winner null)
export function duelSnapshot(s) → object                                      // JSON-fest, ohne attacks
export function fromDuelSnapshot(snap) → DuelState                            // attacks aus RUETHER_BY_ID ergänzt
export function duelOutcome(s, side) → { won, draw, reason, timeMs } | null   // null, solange nicht vorbei
export function duelReward({ won, draw, reason, timeMs }) → { sats, xp }
```

**Zustand:**

```
DuelState = { time, duration, over, winner: null|'a'|'b'|'draw', reason: null|'ko'|'timeout'|'quit'|'lost', lag: { a, b }, a: Side, b: Side }
Side      = { team: Fighter[], active, tapCooldown, charge: null|{ index, fighter, firesAt, ms, dodged }, summons: [{ id, name, damage, power, nextAt, until }] }
Fighter   = makeFighter-Werte; createDuel klont und setzt btc = maxBtc = round(maxBtc × HP_MULT)
Input     = { taps?: n, dodge?: bool, special?: index, switchTo?: index, quit?: bool }
```

Seite `a` ist der Host, `b` der Gast. Gegner jeder Seite ist immer der **aktive** Rüther der anderen Seite.

**Regeln** (Werte aus `CONST`, `data.js` bleibt unverändert):

- **Tipp:** Schaden `FAST_DAMAGE × power × weak` am gegnerischen aktiven Rüther, Mining `+FAST_ENERGY` (höchstens `MAX_ENERGY`), dann `FAST_COOLDOWN`.
  - `weak` = `WEAKEN_FACTOR`, solange der Angreifer geschwächt ist, sonst 1.
  - Betäubt: kein Tipp (Event `stunnedTap`).
  - Höchstens ein Tipp pro Schritt.
- **Spezial** (`attacks` aus `data.js`):
  - Geht nur, wenn nicht betäubt, `energy ≥ cost`, `once` noch frei und **keine eigene Spezial angekündigt** ist. Sonst `specialDenied`.
  - Feindliche Attacken (`damage > 0` oder `poison`/`stun`/`weaken`) werden **angekündigt**: `charge` für `DUEL.WARN + lag[Ziel]` ms (`lag` höchstens `LAG_MAX`), danach feuern sie auf den dann aktiven Gegner.
  - **Funkzeit-Gutschrift** `s.lag.b`: Der Gast sieht eine Ladung einen Funkweg (plus Sendetakt) später, sein Ausweichen braucht noch einen. Der Host setzt `lag.b = rtt + SEND_MS / 2` aus der Umlaufzeit, die der Gast mit `di { echo, rtt }` meldet; `lag.a` bleibt 0. So hat der Gast ungefähr dasselbe Ausweichfenster wie der Host.
  - Reine Selbst-Attacken (`heal`, `summon` ohne Schaden, also Unlimited Credits und Familientreffen) wirken sofort.
- **Ausweichen:** `dodge`, während die Gegenseite eine Ladung hat, setzt `dodged`.
  - Ausgewichen: Schaden `× DODGE_FACTOR`, kein Gift, keine Betäubung, keine Schwächung.
  - `drain` heilt um den tatsächlich verursachten Schaden.
  - Ausweichen ohne Ladung bewirkt nichts.
- **Wirkungen beim Feuern:**
  - Schaden `atk.damage × power × weak(Angreifer)`.
  - `poison` gibt dem Ziel `{ perSec, until, acc }`.
  - `stun` setzt `stunUntil`, aber nur, wenn das Ziel nicht schon betäubt ist oder erst seit weniger als `STUN_SAFE` wieder frei (`stunSafeUntil`); sonst sperrt eine billige Betäubung das ganze Duell.
  - `weaken` setzt beim **Ziel** `weakenedUntil`: dessen eigener Schaden sinkt.
  - `drain` heilt den Angreifer.
- **Selbst-Attacken:** `heal` heilt den Angreifer. `summon` schickt Helfer, die alle `SUMMON_INTERVAL` mit `damage × power` den gegnerischen aktiven Rüther treffen, bis `summonMs` um ist. Ausweichen hilft dagegen nicht.
- **Gift** tickt nur am jeweils aktiven Rüther (wie im Arena-Kampf).
- **Wechseln** auf einen lebenden Rüther ist frei, auch betäubt. Eine eigene Ladung bricht dabei ab (`cancel`, Mining ist weg).
- **K.o.:** Aktiver bei 0 BTC → `faint`, die eigene Ladung bricht ab, automatischer Wechsel zum ersten Lebenden (`switch`). Ist keiner mehr da, ist die Seite raus.
- **Ende:**
  - Beide Seiten im selben Schritt raus → `'draw'`.
  - Eine Seite raus → die andere gewinnt, `'ko'`.
  - `time ≥ duration` → mehr Rest-BTC-Anteil (Summe btc / Summe maxBtc) gewinnt, gleich = `'draw'`, Grund `'timeout'`.
  - `quit` → die andere Seite gewinnt, `'quit'`.
- **Schrittfolge in `tickDuel`** (für Tests festgelegt):
  1. `time += dt`.
  2. Je Seite a, dann b: Cooldown runter, `quit`, `switchTo`, Tipps, Spezial-Start.
  3. Ausweichen beider Seiten.
  4. Fällige Ladungen feuern (a, dann b).
  5. Helfer, dann Gift.
  6. K.o. und Wechsel beider Seiten.
  7. Ende prüfen.

**Events** (JSON-fest, Kämpfer per Seite + Teamindex, Attacken per Index, keine Objekt-Referenzen):

```
fast { side, damage } · stunnedTap { side } · charge { side, fighter, index, ms } · cancel { side, fighter, index }
dodge { side } · special { side, fighter, index, damage, dodged } · specialDenied { side, index }
poisoned { side, ms } · poison { side, damage } · stun { side, ms } · weaken { side, ms } · heal { side, amount }
summoned { side, ids, names, ms } · summon { side, id, damage } · switch { side, to } · faint { side, fighter } · end { winner, reason }
```

Bei `poisoned`, `poison`, `stun` und `weaken` ist `side` das **Ziel**, sonst der Handelnde.

**Belohnung** (`duelReward`):

- `reason 'lost'` → 0.
- Wer aufgibt (`quit`, verloren), bekommt 0.
- Ein Sieg durch Aufgeben zählt nur ab `timeMs ≥ MIN_REWARD_MS`, sonst 0. So lässt sich nichts mit Start-und-gleich-Aufgeben farmen.
- Sonst `REWARD.win` / `lose` / `draw`.

### §3.2 Netz: host-autoritativ

- **Host:** Feste Schritte von `DUEL.STEP` (50 ms) mit Aufholen, angetrieben von rAF wie im Arena-Kampf: `tickDuel(s, 50, { a: lokal, b: gepuffert })`. Alle `SEND_MS` schickt er `{ t: 'ds', s: duelSnapshot(s), ev: Events seit dem letzten Senden, p: null|{ by: name } }` und sofort nach `end`.
- **Gast:** schickt Eingaben sofort, Tipps pro Frame gebündelt: `{ t: 'di', taps?, dodge?, special?, switchTo?, quit? }`. Der Host addiert Tipps im Puffer (höchstens 4 offen) und übernimmt `dodge`/`special`/`switchTo`/`quit` beim nächsten Schritt. Auf `ds` gilt: `s = fromDuelSnapshot(msg.s)`, `msg.ev` animieren, zeichnen.
- **Start-Abgleich:** Der Gast meldet `{ t: 'dready' }`, sobald sein Screen steht. Beide zeigen das VS-Intro (`CONST.INTRO_MS`). Die Uhr des Hosts läuft erst, wenn das Intro vorbei **und** `dready` da ist, sonst steht dort „Warte auf <Name> …“.
- **Pause:** `{ t: 'dp', on }` von beiden Seiten. Der Host hält an bzw. läuft weiter und schickt `p`. Beide sehen „Pause (<Name>)“ mit „Weiter“. Weiter darf jeder drücken.

### §3.3 Darstellung `js/duel-ui.js`, `css/duel.css`

```js
export function createDuelScreen({ el, onResult, onEnd, onEvent }) → { start(opts), stop() }
start({ link, role: 'host'|'guest', teams: { host: Pick[], guest: Pick[] }, names: { host: { name, avatar }, guest: { name, avatar } } })
onResult({ won, draw, reason, timeMs })   // genau einmal, sobald entschieden: App verbucht und speichert sofort
onEnd({ won, draw, reason, timeMs })      // genau einmal danach (Overlay-Knopf „Weiter“), nur noch Navigation
onEvent(e)                                // eigene Events für Statistik/Tagesquests: special, dodge (gelungen), { type: 'combo', value }
```

- Baut sein Markup selbst in `el` (`#screen-duel`, wie `quest/view.js`). Eigene Seite = `role === 'host' ? 'a' : 'b'`, gezeichnet wird aus eigener Sicht.
- **Stil des Kampf-Screens:** Holzleisten, Pixel-Schrift. Oben die Leiste des Gegners mit Name, Lv., BTC-Balken, Status und **seiner Mining-Leiste** (damit man Spezials kommen sieht), rechts der Timer mit Pause darunter, links Aufgeben (×), wie im Arena-Kampf.
- **Bühne:** Rechts oben das **echte Gesicht** des gegnerischen aktiven Rüthers, links unten meins, beide groß im Seltenheitsrahmen. Daneben je eine Team-Reihe mit 3 kleinen echten Gesichtern; K.o. steht als Etikett „pleite“ darunter, das Gesicht bleibt unverändert.
- **Unten:** meine Leiste (BTC, Hashrate, Mining), die Spezial-Knöpfe wie in `battle-ui.js` (Name, Kosten, Schaden), „Wechseln“. Aufgeben (×, mit Rückfrage) und Pause stehen oben (siehe Stil).
- **Eingabe wie im Arena-Kampf:** Tippen auf die Bühne = Angriff, Wischen über 40 px oder Pfeiltasten = Ausweichen.
- **Ankündigung:**
  - Lädt der Gegner, blitzt mein Rand rot, seine Sprechblase ruft „<Attackenname>!“ mit seinem echten Gesicht, dazu der Hinweis „Wischen zum Ausweichen!“.
  - Lade ich selbst, läuft auf meinem Knopf ein Fortschritt.
- **Effekte über `js/fx.js`:**
  - `propFx` mit `atk.prop` und dem echten Gesicht des Angreifers als Reiter, Pfad `arc-to-enemy` bzw. `arc-to-me`.
  - Kurzes Banner (700 ms) mit Gesicht und Spruch aus `LINES[id].fight` **nur über der Leiste des Handelnden** (Timer, × und II bleiben frei; lädt der Gegner gerade, hat seine Blase Vorrang), Zahlen, ₿-Regen; die Familie rennt mit echten Gesichtern herein.
  - Treffer-, Gift- und Heil-Effekte **neben** dem Gesicht (Gegner links daneben, ich rechts daneben), nie darauf.
  - **Kein Freeze** (die Zeit gehört dem Host).
  - Pfad-Keyframes und `--fx-*`-Anker aus `css/battle.css` und `css/theme.css` mitnutzen, eigenes Layout in `css/duel.css`.
- **Ende:** Overlay mit beiden echten Gesichtern.
  - Sieg: „<Name> zahlt die Runde!“, Konfetti, Sats zählen hoch.
  - Niederlage: Papier mit Rotstempel.
  - Unentschieden: „Unentschieden. Jeder zahlt sein Dosenbier selbst.“
  - Abgebrochen: „Duell abgebrochen (Verbindung weg). Keine Wertung.“
  - Knopf „Weiter“ → `onEnd`.
- **Verbindung:** Bei `lost` oder `away` des Partners pausiert der Host („Verbindung zu <Name> weg …“). Bei `connected again` bzw. `back` bleibt Pause, bis jemand „Weiter“ drückt. Bei `disconnected` gilt auf beiden Seiten `endDuel(s, null, 'lost')`.
  - `connected again` setzt `away` des Partners zurück; die Lobby schickt nach jedem `connected` ihren Sichtbarkeitsstand (`away`/`back`) neu.
  - Ist das Duell beim Host während `lost` entschieden, wartet sein „Weiter“, bis die Verbindung wieder steht (dann geht das Ende raus) oder endgültig weg ist.
  - Gast: Steht die Verbindung, ist der Host in der App und kommt `TIMEOUT_MS + 2 s` kein `ds` (der Herzschlag läuft, also hat der Host den Screen verlassen), endet das Duell mit `endDuel(s, null, 'lost')`.

## §4 Koop-Quest

### §4.1 Engine-Erweiterung `js/quest/engine.js`

- `createQuest({ …, maxUnits = 3 })`: Ohne `solo` gilt `team.slice(0, maxUnits)`, Koop übergibt 4 (alle Karten haben 9 Plattform-Felder). Jede Einheit bekommt `owner: f.owner ?? null` (`'host'|'guest'`).
- **Owner-Regel:** Befehle mit Einheit (`move`, `stop`, `interact`, `ability`) und mit `c.by` gegen eine Einheit, deren `owner` gesetzt ist und anders lautet → `fail` mit Grund `'notYours'`, `FAIL.notYours = 'Das ist nicht dein Rüther.'`.
  - Ohne `c.by` oder ohne `owner` bleibt alles wie bisher (rückwärtskompatibel).
  - Wiederbeleben fremder Einheiten (`interact { unit }`) und das Gesicht des Partners bei `teammatePoint` sind erlaubt.
  - `extract` und `abort` darf jeder.
- **Schnappschuss** (rein, JSON-fest):

```js
export function questSnapshot(st) → object
export function applyQuestSnapshot(st, snap) → void   // ändert st an Ort und Stelle
```

  - Kopiert alle Schlüssel von `st` **außer den statischen**: `tiles`, `paths`, `rng`, `mission`, `variant`, `layout`, `theme`, `w`, `h`, `gate`, `pads`, `spots`, `setup`.
  - Typed Arrays (`gas`, `smoke`, `wall`, `fwOpaque`) gehen dünn als `[i, wert, i, wert, …]`, nur Werte `> st.time`. Nicht-ganze Zahlen werden auf 3 Nachkommastellen gerundet.
  - `applyQuestSnapshot` behält die **Objekt-Identität**, weil die View Interpolation und Effekte über WeakMaps am Objekt hängt:
    - `units`, `enemies`, `objs`, `doors`: per Index `Object.assign` ins vorhandene Objekt (neue Verstärkungen werden angehängt, Länge angleichen).
    - `effects`: per `id` wiederverwenden.
    - Typed Arrays: `fill(0)`, dann setzen.
    - Alles andere wird ersetzt.
  - Die Engine löscht keine Schlüssel (null statt `delete`), sonst blieben beim Gast alte Werte stehen.
- **Größe:** Gemessen ca. 6–8 KB pro Schnappschuss. Grenze 24 KB (Test), Nachrichten über 8000 Zeichen zerlegt die Hülle ohnehin. `ponytail:` immer volle Schnappschüsse alle 200 ms. Deltas erst einbauen, wenn es über echtes Bluetooth ruckelt.

### §4.2 View `js/quest/view.js` (Netz-Kleber gern in `js/quest/coop.js`)

```js
createQuestScreen({ el, onEnd, onProgress }) → { start(opts), stop(), send(cmd), setRival(r), debug() }
start({ mission, setup, fighters, loadouts, rng, tutorial,
        coop?: { link, role: 'host'|'guest', partner: { name, avatar } } })
onProgress({ done, total, min, timeMs, alarm, over, result })   // höchstens 1× pro s und beim Ende (für das Rennen, §5)
setRival({ name, avatar, done, total, over, result } | null)     // Rennen: Gegner-Chip in der oberen Leiste
```

- **Koop:**
  - `fighters` in fester Reihenfolge, erst die Picks des Hosts, dann die des Gasts. Jeder Kämpfer ist `{ ...makeFighter(...), loadout, owner }`.
  - `createQuest({ …, maxUnits: 4 })` läuft auf beiden Geräten mit identischen Argumenten.
  - `tutorial` ist im Koop immer aus.
- **Bedienung:**
  - Auswählen geht nur für eigene Einheiten (`owner === role`); „Alle“ meint alle eigenen.
  - Die Team-Leiste zeigt alle 4 echten Gesichter, unter den fremden steht der Name des Partners als Etikett.
  - Tippen auf eine fremde → Meldung „Das ist <Name>s Rüther.“
  - `fail`-Meldungen zeigt jedes Gerät nur für eigene Einheiten (und für Befehle ohne Einheit).
- **Host:**
  - Spielt wie bisher (50-ms-Schritte) und sammelt alle Events.
  - Alle 200 ms Echtzeit, auch in der Pause, schickt er `{ t: 'qs', s: questSnapshot(st), ev, p: paused }`, dazu sofort nach dem `end`-Event.
  - Auf `{ t: 'qc', cmd }`: `cmd.by = 'guest'` setzen (ein mitgeschicktes `by` wird überschrieben). Erlaubt sind nur `move`, `stop`, `interact`, `ability`, `extract`, `abort`. Dann `tick(st, 0, [cmd])`, Events selbst animieren und in den Stapel legen.
  - `{ t: 'qp', on }` = Pause an/aus wie der eigene Knopf.
  - Eigene Befehle bekommen `by: 'host'`.
- **Gast:**
  - Tickt **nie**. `send(cmd)` schickt `{ t: 'qc', cmd }` und liefert `[]`.
  - Auf `qs`: `snap()` (alte Lage merken), `applyQuestSnapshot`, `handle(ev)`, `paused = p`, Interpolation neu starten. Die Interpolation läuft über 200 ms statt 50.
  - `resume` schickt der Gast nie. Die Kieser-Szene schließt sich selbst, sobald der Zustand nicht mehr pausiert ist.
  - Das `end`-Event spielt den Abspann, und `onEnd` liefert die Zusammenfassung des Hosts.
  - Den Pause-Knopf schickt er als `qp`.
- **Start-Abgleich:**
  - Der Gast meldet `{ t: 'qr' }`, wenn seine Bilder geladen sind.
  - Beim Host steht im Briefing statt „Los!“ „Warte auf <Name> …“, bis `qr` da ist. Sein „Los!“ hebt die Pause auf.
  - Der Gast sieht dasselbe Briefing mit „Warte auf <Host> …“; es schließt sich beim ersten `qs` mit `p: false`.
- **Aufgeben:** Rückfrage „Aufgeben beendet die Quest für euch beide.“, dann `abort`.
- **Abbruch:**
  - Host bei `lost` oder `away` des Partners: Pause und Meldung „Verbindung zu <Name> weg …“. Bei `connected again` bzw. `back` kommt „<Name> ist zurück“, und es geht mit „Weiter“ weiter.
  - Host bei `disconnected`: Popup „<Name> ist weg.“ [Aufgeben] [Allein weiter]. „Allein weiter“ setzt `owner = 'host'` für alle Einheiten.
  - Gast bei `disconnected`: Ende mit `{ ...questSummary(st), result: 'abort', reason: 'lost' }`. Ebenso, wenn die Verbindung steht, aber `TIMEOUT_MS + 2 s` kein `qs` kommt (vor dem ersten `qs` 20 s), oder der Link beim Start schon weg ist.
  - Gast: `applyQuestSnapshot` übernimmt bei Einheiten nie die Identität (`i`, `id`, `name`, `rarity`, `level`, `owner`, `abilities`), die Zusammenfassung des Hosts wird vor `onEnd` gesäubert (`cleanSummary` in `coop.js`, §0).

**Belohnung für beide:** Jedes Gerät verbucht seine Zusammenfassung selbst mit `questResult(save, missionId, result, score, alarmFree, { kieser, fine })`, Score und Strafe gelten gemeinsam. XP über `gainXp`, sofort gespeichert. Der Ergebnis-Screen zeigt „Koop mit <Name>“ und beide Gesichter.

## §5 Quest-Rennen

- Beide spielen **lokal parallel** dieselbe Mission mit demselben `setup` aus `start` und `rng = seededRng(seed)` aus `js/quests.js`. Jeder spielt mit dem eigenen Team (1–3, bei `solo` sein stärkstes Exemplar), ohne Haunebu-Flug.
- **Live-Zwischenstand:**
  - Die Lobby schickt aus `onProgress` jede Sekunde `{ t: 'rs', seed, done, total, over, result }` (`seed` aus `start` als Runden-Kennung, fremde Runden werden verworfen).
  - Beim Partner kommt das in `setRival(...)`: Chip mit seinem echten Gesicht und „3/6“, bei Ende „fertig“ bzw. „gescheitert“.
- **Ende:**
  - `onEnd` → sofort `questResult` verbuchen und speichern, dann `{ t: 'rend', seed, result, score, timeMs }` schicken.
  - Der Ergebnis-Screen zeigt „Warte auf <Name> …“ samt Live-Stand, bis dessen `rend` da ist.
  - Dann gilt `raceWinner(mein, sein)`. Sieger: `+RACE.WIN_SATS` Sats und `+RACE.WIN_XP` XP, Anzeige „<Name> hat das Rennen gewonnen!“ mit beiden Gesichtern und Scores.
  - Bei `disconnected` vor dem `rend` des Partners: „Rennen ohne Wertung (Verbindung weg).“, kein Bonus.
- `js/quest/race.js`:

```js
export const RACE = { WIN_SATS: 1000, WIN_XP: 100, PROGRESS_MS: 1000 };
export function raceWinner(a, b) → 'a'|'b'|'draw'   // a, b = { result, score, timeMs }
// 1. höherer score  2. result 'success' vor allem anderen  3. bei zwei Erfolgen kleinere timeMs  4. sonst 'draw'
// (ohne Erfolg zählt die Zeit nicht: sonst gewinnt, wer am schnellsten aufgibt)
```

- Pause und Aufgeben sind lokal; die Pause gehört zu Commandos. Verbindungsabbrüche halten das eigene Spiel nicht an.

## §6 Robustheit

| Fall | Duell | Koop | Rennen | Lobby |
|---|---|---|---|---|
| `lost` (kein Lebenszeichen 6 s / nativ weg) | Host pausiert, Overlay „Verbindung weg …“ | Host pausiert, Meldung | eigenes Spiel läuft, Chip „Verbindung weg“ | Banner, verbindet neu |
| `connected again` | Pause bleibt, „Weiter“ | Pause bleibt, „Weiter“ | Chip aktualisiert sich | Zustand wieder senden (`me`, `mode`, `pick`) |
| `disconnected` (nach 60 s oder `bye`) | `endDuel(null, 'lost')`, keine Wertung | Host: Allein weiter / Aufgeben; Gast: Ende `abort` | ohne Wertung, kein Bonus | zurück zu 1 bzw. 2 |
| Pause/Weiter | jeder (`dp`) | jeder (`qp`, gemeinsam) | lokal | — |
| Versionsabgleich | `PROTO` hart (`disconnected version`), `VERSION` als Hinweis | ← | ← | ← |
| Handy gesperrt / App im Hintergrund | `keepAwake` verhindert die Auto-Sperre; bei `visibilitychange: hidden` geht `away` raus → Host pausiert. Friert das JS ein, greift `lost` | ← | eigene View pausiert (`onHide`) | — |
| App beim Partner neu gestartet | neue `sid` → `disconnected closed` → wie oben | ← | ← | ← |

Modi werden **nicht** über einen App-Neustart fortgesetzt; Wiederverbinden gibt es nur, solange beide Apps laufen. Belohnungen werden immer sofort beim Entscheid gespeichert (`onResult` bzw. `onEnd`), wie bei Arena und Quest.

## §7 Tests

Alles muss laufen: `cd D:\GPTDev\ruetherpokemon && node --test test/*.test.mjs` und `for f in js/*.js js/quest/*.js js/net/*.js; do node --check "$f"; done`.

- **`test/net.test.mjs`** (Node hat `BroadcastChannel` global; jeder Test schließt alle Links, sonst bleibt der Prozess offen):
  - Zwei `local`-Links mit eigenem `channel`: `host`/`join` → beide `connected` mit Namen und gleichem `code`.
  - Nachrichten-Hin-und-Rück.
  - 100-KB-Nachricht kommt zerlegt heil an.
  - Anderes `PROTO` → `disconnected version`.
  - Kurze `timing`: Funkstille → `lost` → wieder senden → `connected again` → `close` → Partner `disconnected left`.
  - `send` ohne Verbindung liefert `false`.
  - `nearby` mit Ersatz-`plugin`: `host`/`join` rufen das Plugin auf, Plugin-Events werden zu Link-Events, `send` schickt JSON-Text, Fehler-`code` kommt durch.
- **`test/duel.test.mjs`:**
  - Dieselbe Eingabefolge zweimal ergibt gleiche Events und gleichen Endzustand.
  - Tipp-Schaden und Cooldown.
  - Ladung → nach `WARN` Treffer; Ausweichen ergibt 25 % ohne Gift und Betäubung.
  - `heal` und `summon` wirken sofort, `once` geht nur einmal.
  - Wechsel bricht die Ladung ab; K.o. wechselt automatisch.
  - Ende per K.o., per Zeit (BTC-Anteil), Unentschieden und `quit`.
  - `fromDuelSnapshot(duelSnapshot(s))` tickt genauso weiter wie `s`; Schnappschuss-JSON unter 4 KB.
  - `duelReward` in allen Fällen inklusive `MIN_REWARD_MS` und `lost`.
- **`test/coop.test.mjs`:**
  - 4 Einheiten mit `owner` bei `maxUnits: 4`.
  - Fremder Befehl → `fail notYours`; eigener und Befehl ohne `by` gehen; Wiederbeleben der Partner-Einheit geht.
  - Schnappschuss-Runde: Host läuft N Schritte mit Befehlen, ein frischer Spiegel (`createQuest` mit gleichen Argumenten) bekommt `applyQuestSnapshot` → `questSnapshot(spiegel)` deepEqual `questSnapshot(host)`. Die Objekte der Einheiten und Gegner bleiben dieselben.
  - Alle Missionen nach 400 Schritten mit Bewegung: Schnappschuss unter 24 KB, Events überstehen JSON-Hin-und-Rück.
  - `raceWinner`: alle vier Stufen.
- **Zwei-Fenster-Playtest** über `local`. Lokaler Server, zwei **Fenster** nebeneinander, keine Tabs, denn ein Hintergrund-Tab drosselt rAF und Timer. Adressen: `?slot=1` und `?slot=2` (getrennte Spielstände, §8), optional `&lag=150`.
  - Lobby: Host/Beitreten, Code gleich, Modus, Teams, Bereit, Start.
  - Duell bis Sieg; Duell mit Fenster schließen → beim anderen nach 60 s „abgebrochen“.
  - Koop-Quest mit 2+2 Einheiten bis Abheben; Rennen bis zum Ergebnis mit Bonus.
  - Pause von beiden Seiten.
  - Prüfen bei 390×844 und 375×667.
- **Android:** `cd native && node build-www.mjs && npx cap sync android && cd android && JAVA_HOME="C:/Program Files/Android/Android Studio/jbr" ./gradlew assembleDebug` muss bauen. Rauchtest im Emulator (AVD `Medium_Phone_API_36.1`): App startet, Lobby öffnet, „Spiel eröffnen“ fragt die Berechtigung ab und meldet entweder „warte“ oder einen der Fehlercodes; nichts stürzt ab. Den echten Test über Nearby macht Sebi mit zwei Handys.

## §8 Zuständigkeiten (Dateien je Agent)

Jeder ändert **nur** seine Dateien und baut gegen die Schnittstellen oben. `js/data.js` ändert niemand.

| Agent | Dateien |
|---|---|
| **Native** | `native/android/**` (`NearbyLinkPlugin.java` neu, `MainActivity.java`, `AndroidManifest.xml`, `app/build.gradle`), `native/capacitor.config.json`, `native/package.json`. Nicht `native/www` (erzeugt von `build-www.mjs`). |
| **Netz** | `js/net/link.js` (neu), `test/net.test.mjs` (neu) |
| **Duell** | `js/duel.js`, `js/duel-ui.js`, `css/duel.css`, `test/duel.test.mjs` (alle neu) |
| **Koop** | `js/quest/*` (`engine.js`: `maxUnits`/`owner`/Schnappschuss; `view.js`: Koop, `onProgress`, `setRival`; neu `race.js`, gern `coop.js`), `test/coop.test.mjs` (neu) |
| **App** | `js/app.js`, `index.html`, `js/screens.js`, `css/screens.css`, `css/app.css`, `js/lobby.js` (neu), `README.md`, dazu `js/storage.js`, `tools/make_sw.py`, `sw.js` |

**App im Einzelnen:**

- **`index.html`:** `<section id="screen-lobby" class="screen"></section>`, `<section id="screen-duel" class="screen"></section>`, `<link rel="stylesheet" href="css/duel.css">`.
- **`js/screens.js`:** Profil-Knopf „Zusammen spielen“ (`onTogether`), `VERSION = 'v11'`, im Quest-Ergebnis-Screen die Koop- und Rennen-Infos.
- **`js/app.js`:**
  - Lobby einhängen, `'screen-lobby'` und `'screen-duel'` in `BEAM_WAIT`, Zurück-Taste (Lobby: Trennen-Rückfrage; Duell: Hinweis wie im Kampf).
  - Verbuchen über `duelReward`, `questResult` und `RACE`, dabei Tagesquests aus `onEvent` (`special`, `dodge`, `combo`) mitzählen.
  - Für Mehrspieler-Quests kein `questRun` und kein Flug; das `onEnd` des Quest-Screens leitet an die Lobby weiter, solange ein Mehrspieler-Lauf aktiv ist.
- **`js/storage.js`:** `?slot=N` (eine Ziffer) → Schlüssel `ruether-go-N` (Backup entsprechend), nur wenn `location` existiert. So haben zwei Fenster getrennte Spielstände.
- **`tools/make_sw.py`:** zusätzlich `js/net/*.js`, dann `sw.js` neu erzeugen.
- **`README.md`:** Abschnitt „Zusammen spielen“ mit Anleitung (Bluetooth an im Flugmodus) und Zwei-Fenster-Testanleitung.

**Reihenfolge:** Netz, Duell, Koop und Native arbeiten parallel gegen diese Spec. Die App bindet ein, sobald die Module stehen, danach folgt der Zwei-Fenster-Playtest (§7).

**Nachrichten-Übersicht:**

| Modul | `t` | Richtung | Inhalt |
|---|---|---|---|
| Hülle | `hello`, `ping`, `bye`, `_part` | beide | reserviert, §1.2 |
| Lobby | `me`, `mode`, `pick`, `start`, `leave`, `away`, `back` | §2 | §2 |
| Duell | `dready`, `di` | Gast → Host | bereit; Eingabe |
| Duell | `ds` | Host → Gast | `{ s, ev, p }` alle 100 ms |
| Duell | `dp` | beide | `{ on }` |
| Koop | `qr`, `qc` | Gast → Host | bereit; `{ cmd }` |
| Koop | `qs` | Host → Gast | `{ s, ev, p }` alle 200 ms |
| Koop | `qp` | Gast → Host | `{ on }` |
| Rennen | `rs` | beide | `{ seed, done, total, over, result }` je s |
| Rennen | `rend` | beide | `{ seed, result, score, timeMs }` |
