package com.flusso.app;

import android.os.Bundle;
import android.util.Log;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Log.d("MainActivity", "Registering plugins...");
        registerPlugin(QueuePlugin.class);
        registerPlugin(BackgroundPlugin.class);
        registerPlugin(Media3Plugin.class);
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
