package de.ruether.go;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NearbyLinkPlugin.class); // lokales Plugin: cap sync findet es nicht von selbst
        super.onCreate(savedInstanceState);
    }
}
