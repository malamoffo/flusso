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
        Log.d("MainActivity", "Registering plugins...");
        registerPlugin(com.flusso.app.QueuePlugin.class);
        registerPlugin(com.flusso.app.BackgroundPlugin.class);
        registerPlugin(com.flusso.app.Media3Plugin.class);
        super.onCreate(savedInstanceState);
        Log.d("MainActivity", "Plugins registered.");
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
