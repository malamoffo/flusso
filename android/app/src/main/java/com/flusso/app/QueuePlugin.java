package com.flusso.app;

import android.content.Context;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "QueuePlugin")
public class QueuePlugin extends Plugin {

    private static final String TAG = "QueuePlugin";

    private static QueuePlugin instance;
    private static JSArray currentQueue   = new JSArray();
    private static JSArray recentQueue    = new JSArray();
    private static JSArray favoritesQueue = new JSArray();
    private static String  pendingMediaId = null;

    public QueuePlugin() {
        super();
        instance = this;
        Log.d(TAG, "QueuePlugin constructor called");
    }

    @Override
    public void load() {
        super.load();
        instance = this;
        Log.d(TAG, "QueuePlugin load() called");
        // Precarica subito i file su disco in memoria statica,
        // così AndroidAutoService li trova anche prima del primo setQueue
        Context ctx = getContext();
        if (ctx != null) {
            preloadFromDisk(ctx);
        }
    }

    public static QueuePlugin getInstance() {
        return instance;
    }

    public static void setPendingMediaId(String mediaId) {
        pendingMediaId = mediaId;
    }

    // ─── Plugin methods ───────────────────────────────────────────────────────

    @PluginMethod
    public void getPendingMediaId(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("mediaId", pendingMediaId);
        call.resolve(ret);
        pendingMediaId = null;
    }

    @PluginMethod
    public void setQueue(PluginCall call) {
        Log.d(TAG, "setQueue called");
        JSArray queue     = call.getArray("queue");
        JSArray recent    = call.getArray("recent");
        JSArray favorites = call.getArray("favorites");

        if (queue != null) {
            currentQueue = queue;
            saveToFile("queue.json", queue.toString());
            Log.d(TAG, "setQueue successful: queue=" + queue.length() + " items");
        } else {
            Log.d(TAG, "setQueue: queue is null");
        }

        if (recent != null) {
            recentQueue = recent;
            saveToFile("recent.json", recent.toString());
            Log.d(TAG, "setQueue: recent=" + recent.length() + " items");
        }

        if (favorites != null) {
            favoritesQueue = favorites;
            saveToFile("favorites.json", favorites.toString());
            Log.d(TAG, "setQueue: favorites=" + favorites.length() + " items");
        }

        AndroidAutoService.notifyQueueChanged();
        call.resolve();
    }

    @PluginMethod
    public void updateMediaSession(PluginCall call) {
        String  mediaId         = call.getString("mediaId");
        String  title           = call.getString("title");
        String  artist          = call.getString("artist");
        String  album           = call.getString("album");
        String  artwork         = call.getString("artwork");
        String  artworkFilename = call.getString("artworkFilename");
        Double  duration        = call.getDouble("duration");
        Double  position        = call.getDouble("position");
        Boolean isPlaying       = call.getBoolean("isPlaying");

        AndroidAutoService service = AndroidAutoService.getInstance();
        if (service != null) {
            service.updateSessionState(
                    mediaId, title, artist, album,
                    artwork, artworkFilename,
                    duration, position, isPlaying
            );
        }

        call.resolve();
    }

    // ─── Static accessors (usati da AndroidAutoService al cold start) ─────────

    public static JSArray getStaticQueue(Context context) {
        if (context != null) {
            JSArray fromDisk = loadFromDisk(context, "queue.json");
            currentQueue = fromDisk;
        }
        return currentQueue;
    }

    public static JSArray getStaticRecent(Context context) {
        if (context != null) {
            JSArray fromDisk = loadFromDisk(context, "recent.json");
            recentQueue = fromDisk;
        }
        return recentQueue;
    }

    public static JSArray getStaticFavorites(Context context) {
        // ✅ Fix: rilegge SEMPRE da file per evitare dati stantii in RAM
        if (context != null) {
            JSArray fromDisk = loadFromDisk(context, "favorites.json");
            favoritesQueue = fromDisk;
        }
        Log.d(TAG, "getStaticFavorites returning " + favoritesQueue.length() + " items");
        return favoritesQueue;
    }

    // ─── Listener triggers (chiamati da AndroidAutoService) ──────────────────

    public void triggerPlayRequest(String id) {
        JSObject data = new JSObject();
        data.put("id", id);
        notifyListeners("playRequest", data);
        Log.d(TAG, "triggerPlayRequest: " + id);
    }

    public void triggerActionRequest(String action) {
        JSObject data = new JSObject();
        data.put("action", action);
        notifyListeners("actionRequest", data);
        Log.d(TAG, "triggerActionRequest: " + action);
    }

    public void triggerSeekRequest(double positionSeconds) {
        JSObject data = new JSObject();
        data.put("position", positionSeconds);
        notifyListeners("seekRequest", data);
    }

    // ─── File I/O ─────────────────────────────────────────────────────────────

    private void saveToFile(String filename, String content) {
        // ✅ Fix: fallback a applicationContext se getContext() è null
        Context ctx = resolveContext();
        if (ctx == null) {
            Log.e(TAG, "saveToFile: context null, cannot save " + filename);
            return;
        }
        try {
            java.io.FileOutputStream fos = ctx.openFileOutput(
                    filename, Context.MODE_PRIVATE
            );
            fos.write(content.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            fos.close();
            Log.d(TAG, "saveToFile OK: " + filename + " (" + content.length() + " bytes)");
        } catch (Exception e) {
            Log.e(TAG, "saveToFile error: " + filename, e);
        }
    }

    private static JSArray loadFromDisk(Context context, String filename) {
        try {
            java.io.File file = new java.io.File(context.getFilesDir(), filename);
            if (!file.exists()) {
                Log.d(TAG, "loadFromDisk: file not found: " + filename);
                return new JSArray();
            }
            java.io.FileInputStream fis = context.openFileInput(filename);
            byte[] bytes = new byte[(int) file.length()];
            int read = fis.read(bytes);
            fis.close();
            if (read <= 0) return new JSArray();
            String json = new String(bytes, 0, read, java.nio.charset.StandardCharsets.UTF_8);
            Log.d(TAG, "loadFromDisk " + filename + ": " + json.substring(0, Math.min(json.length(), 120)));
            return new JSArray(json);
        } catch (Exception e) {
            Log.e(TAG, "loadFromDisk error: " + filename, e);
            return new JSArray();
        }
    }

    private void preloadFromDisk(Context ctx) {
        if (currentQueue.length()   == 0) currentQueue   = loadFromDisk(ctx, "queue.json");
        if (recentQueue.length()    == 0) recentQueue    = loadFromDisk(ctx, "recent.json");
        if (favoritesQueue.length() == 0) favoritesQueue = loadFromDisk(ctx, "favorites.json");
        Log.d(TAG, "preloadFromDisk: q=" + currentQueue.length()
                + " r=" + recentQueue.length()
                + " f=" + favoritesQueue.length());
    }

    private Context resolveContext() {
        if (getContext() != null) return getContext();
        if (instance != null && instance.getContext() != null) return instance.getContext();
        return null;
    }
}