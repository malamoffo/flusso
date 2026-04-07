package com.flusso.app;

import android.content.Context;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "Media3Plugin")
public class Media3Plugin extends Plugin {
    private static final String TAG = "Media3Plugin";
    private static Media3Plugin instance;

    public static Media3Plugin getInstance() {
        return instance;
    }

    @Override
    public void load() {
        super.load();
        instance = this;
        Log.d(TAG, "Media3Plugin loaded");
    }

    @PluginMethod
    public void updateMetadata(PluginCall call) {
        String id = call.getString("id");
        String title = call.getString("title");
        String artist = call.getString("artist");
        String url = call.getString("url");
        String image = call.getString("image");

        Log.d(TAG, "updateMetadata: " + title + " (id: " + id + ")");

        Media3Service service = Media3Service.getInstance();
        if (service != null) {
            service.updateMetadata(id, title, artist, url, image);
        } else {
            Intent intent = new Intent(getContext(), Media3Service.class);
            getContext().startService(intent);
            Log.w(TAG, "Media3Service not running yet");
        }
        call.resolve();
    }

    @PluginMethod
    public void resetAndPlay(PluginCall call) {
        Media3Service service = Media3Service.getInstance();
        if (service != null) {
            service.resetAndPlay();
            call.resolve();
        } else {
            call.reject("Media3Service not running");
        }
    }

    @PluginMethod
    public void play(PluginCall call) {
        Media3Service service = Media3Service.getInstance();
        if (service != null) {
            service.play();
            call.resolve();
        } else {
            Log.w(TAG, "play() called but Media3Service not running, starting it...");
            Intent intent = new Intent(getContext(), Media3Service.class);
            getContext().startService(intent);
            
            // Poll for service
            new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
                @Override
                public void run() {
                    Media3Service service = Media3Service.getInstance();
                    if (service != null) {
                        service.play();
                        call.resolve();
                    } else {
                        call.reject("Media3Service not running");
                    }
                }
            }, 500);
        }
    }

    @PluginMethod
    public void pause(PluginCall call) {
        Media3Service service = Media3Service.getInstance();
        if (service != null) {
            service.pause();
        }
        call.resolve();
    }

    @PluginMethod
    public void seek(PluginCall call) {
        Long position = call.getLong("position");
        if (position != null) {
            Media3Service service = Media3Service.getInstance();
            if (service != null) {
                service.seek(position);
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void setFavorites(PluginCall call) {
        JSArray favorites = call.getArray("favorites");
        if (favorites != null) {
            android.content.SharedPreferences prefs = getContext().getSharedPreferences("QueuePrefs", Context.MODE_PRIVATE);
            prefs.edit().putString("favorites", favorites.toString()).apply();
            Log.d(TAG, "Favorites synced to native storage");
        }
        call.resolve();
    }

    @PluginMethod
    public void setRecent(PluginCall call) {
        JSArray recent = call.getArray("recent");
        if (recent != null) {
            android.content.SharedPreferences prefs = getContext().getSharedPreferences("QueuePrefs", Context.MODE_PRIVATE);
            prefs.edit().putString("recent", recent.toString()).apply();
            Log.d(TAG, "Recent synced to native storage");
        }
        call.resolve();
    }

    public void notifyPlaybackState(boolean isPlaying) {
        JSObject ret = new JSObject();
        ret.put("isPlaying", isPlaying);
        notifyListeners("onPlaybackStateChanged", ret);
    }

    public void notifyPosition(long positionMs) {
        JSObject ret = new JSObject();
        ret.put("position", positionMs);
        notifyListeners("onPositionChanged", ret);
    }

    public void notifyPlayRequest(String id) {
        JSObject ret = new JSObject();
        ret.put("id", id);
        notifyListeners("playRequest", ret);
    }
}
