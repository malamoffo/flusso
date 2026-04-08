package com.flusso.app;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.concurrent.TimeUnit;

@CapacitorPlugin(name = "BackgroundPlugin")
public class BackgroundPlugin extends Plugin {

    private static final String WORK_NAME = "FlussoBackgroundSync";

    @PluginMethod
    public void setupBackgroundSync(PluginCall call) {
        JSArray feeds = call.getArray("feeds");
        int intervalMinutes = call.getInt("intervalMinutes", 60);

        if (feeds != null) {
            Context context = getContext();
            SharedPreferences prefs = context.getSharedPreferences("FlussoBackgroundPrefs", Context.MODE_PRIVATE);
            prefs.edit().putString("feeds", feeds.toString()).apply();

            // Minimum interval for PeriodicWorkRequest is 15 minutes
            if (intervalMinutes < 15) {
                intervalMinutes = 15;
            }

            Constraints constraints = new Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build();

            PeriodicWorkRequest syncWorkRequest =
                    new PeriodicWorkRequest.Builder(BackgroundSyncWorker.class, intervalMinutes, TimeUnit.MINUTES)
                            .setConstraints(constraints)
                            .build();

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                    WORK_NAME,
                    ExistingPeriodicWorkPolicy.UPDATE,
                    syncWorkRequest
            );

            call.resolve();
        } else {
            call.reject("Feeds array is missing");
        }
    }
    
    @PluginMethod
    public void stopBackgroundSync(PluginCall call) {
        WorkManager.getInstance(getContext()).cancelUniqueWork(WORK_NAME);
        call.resolve();
    }
}
