package com.flusso.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        registerPlugin(BackgroundPlugin.class);
        
        checkVersionAndClearCache();
    }

    private void checkVersionAndClearCache() {
        try {
            PackageInfo pInfo = getPackageManager().getPackageInfo(getPackageName(), 0);
            String currentVersion = pInfo.versionName;
            
            SharedPreferences prefs = getPreferences(Context.MODE_PRIVATE);
            String lastVersion = prefs.getString("last_version", "");
            
            if (!currentVersion.equals(lastVersion)) {
                // Version updated, clear cache
                WebView webView = getBridge().getWebView();
                if (webView != null) {
                    webView.clearCache(true);
                }
                
                // Update last version
                prefs.edit().putString("last_version", currentVersion).apply();
            }
        } catch (PackageManager.NameNotFoundException e) {
            e.printStackTrace();
        }
    }
}
