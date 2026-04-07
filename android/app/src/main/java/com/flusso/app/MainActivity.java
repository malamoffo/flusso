package com.flusso.app;

import android.os.Bundle;
import android.util.Log;
import com.getcapacitor.BridgeActivity;

import com.flusso.app.QueuePlugin;
import com.flusso.app.BackgroundPlugin;
import com.flusso.app.Media3Plugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Log.d("MainActivity", "Registering plugins directly to bridge...");
        if (bridge != null) {
            bridge.registerPlugin(com.flusso.app.QueuePlugin.class);
            bridge.registerPlugin(com.flusso.app.BackgroundPlugin.class);
            bridge.registerPlugin(com.flusso.app.Media3Plugin.class);
            Log.d("MainActivity", "Plugins registered successfully.");
        } else {
            Log.e("MainActivity", "Bridge is null, cannot register plugins!");
        }
    }

    @Override
    public void onStart() {
        super.onStart();
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
        }
    }

    @Override
    public void onPause() {
        super.onPause();
        // Prevent WebView from pausing timers and audio when app goes to background
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().onResume();
        }
    }
}
