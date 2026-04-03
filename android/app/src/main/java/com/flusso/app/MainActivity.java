package com.flusso.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        registerPlugin(QueuePlugin.class);
        registerPlugin(BackgroundPlugin.class);
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
