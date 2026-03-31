package com.flusso.app;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.net.Uri;
import android.os.Bundle;
import android.os.IBinder;
import android.support.v4.media.MediaBrowserCompat;
import android.support.v4.media.MediaDescriptionCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.media.MediaBrowserServiceCompat;

import com.capgo.mediasession.MediaSessionService;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONObject;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;

public class AndroidAutoService extends MediaBrowserServiceCompat {

    private static final String TAG = "AndroidAutoService";
    private static final String ROOT_ID = "root";
    private boolean isBound = false;

    private ServiceConnection connection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName className, IBinder service) {
            try {
                Method getServiceMethod = service.getClass().getDeclaredMethod("getService");
                getServiceMethod.setAccessible(true);
                MediaSessionService mediaSessionService = (MediaSessionService) getServiceMethod.invoke(service);
                
                Field field = MediaSessionService.class.getDeclaredField("mediaSession");
                field.setAccessible(true);
                MediaSessionCompat mediaSession = (MediaSessionCompat) field.get(mediaSessionService);
                if (mediaSession != null) {
                    setSessionToken(mediaSession.getSessionToken());
                    Log.d(TAG, "Successfully attached MediaSessionToken");
                    
                    // We need to delegate standard callbacks to the original ones so standard controls (play/pause) keep working.
                    Field pluginField = MediaSessionService.class.getDeclaredField("plugin");
                    pluginField.setAccessible(true);
                    final Object plugin = pluginField.get(mediaSessionService);
                    
                    final Method actionCallbackMethod = plugin.getClass().getDeclaredMethod("actionCallback", String.class);
                    actionCallbackMethod.setAccessible(true);

                    final Method actionCallbackWithDataMethod = plugin.getClass().getDeclaredMethod("actionCallback", String.class, JSObject.class);
                    actionCallbackWithDataMethod.setAccessible(true);

                    // Add a callback to handle play from media id and delegate others
                    mediaSession.setCallback(new MediaSessionCompat.Callback() {
                        @Override
                        public void onPlayFromMediaId(String mediaId, Bundle extras) {
                            super.onPlayFromMediaId(mediaId, extras);
                            QueuePlugin queuePlugin = QueuePlugin.getInstance();
                            if (queuePlugin != null) {
                                queuePlugin.triggerPlayRequest(mediaId);
                            } else {
                                Log.e(TAG, "QueuePlugin instance is null, cannot send playRequest");
                            }
                        }

                        @Override
                        public void onPlay() {
                            try { actionCallbackMethod.invoke(plugin, "play"); } catch (Exception e) { Log.e(TAG, "Error invoking play", e); }
                        }

                        @Override
                        public void onPause() {
                            try { actionCallbackMethod.invoke(plugin, "pause"); } catch (Exception e) { Log.e(TAG, "Error invoking pause", e); }
                        }

                        @Override
                        public void onSeekTo(long pos) {
                            try {
                                JSObject data = new JSObject();
                                data.put("seekTime", (double) pos / 1000.0);
                                actionCallbackWithDataMethod.invoke(plugin, "seekto", data);
                            } catch (Exception e) { Log.e(TAG, "Error invoking seekto", e); }
                        }

                        @Override
                        public void onRewind() {
                            try { actionCallbackMethod.invoke(plugin, "seekbackward"); } catch (Exception e) { Log.e(TAG, "Error invoking seekbackward", e); }
                        }

                        @Override
                        public void onFastForward() {
                            try { actionCallbackMethod.invoke(plugin, "seekforward"); } catch (Exception e) { Log.e(TAG, "Error invoking seekforward", e); }
                        }

                        @Override
                        public void onSkipToPrevious() {
                            try { actionCallbackMethod.invoke(plugin, "previoustrack"); } catch (Exception e) { Log.e(TAG, "Error invoking previoustrack", e); }
                        }

                        @Override
                        public void onSkipToNext() {
                            try { actionCallbackMethod.invoke(plugin, "nexttrack"); } catch (Exception e) { Log.e(TAG, "Error invoking nexttrack", e); }
                        }

                        @Override
                        public void onStop() {
                            try { actionCallbackMethod.invoke(plugin, "stop"); } catch (Exception e) { Log.e(TAG, "Error invoking stop", e); }
                        }
                    });
                }
            } catch (Exception e) {
                Log.e(TAG, "Failed to get MediaSession via reflection", e);
            }
        }

        @Override
        public void onServiceDisconnected(ComponentName arg0) {
            isBound = false;
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "onCreate");
        // Bind to the Capgo MediaSessionService to get the session token
        Intent intent = new Intent(this, MediaSessionService.class);
        isBound = bindService(intent, connection, Context.BIND_AUTO_CREATE);
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        Log.d(TAG, "onDestroy");
        if (isBound) {
            unbindService(connection);
            isBound = false;
        }
    }

    @Nullable
    @Override
    public BrowserRoot onGetRoot(@NonNull String clientPackageName, int clientUid, @Nullable Bundle rootHints) {
        Log.d(TAG, "onGetRoot");
        // Allow all clients to connect, but return a simple root
        return new BrowserRoot(ROOT_ID, null);
    }

    @Override
    public void onLoadChildren(@NonNull String parentId, @NonNull Result<List<MediaBrowserCompat.MediaItem>> result) {
        Log.d(TAG, "onLoadChildren: " + parentId);
        List<MediaBrowserCompat.MediaItem> mediaItems = new ArrayList<>();

        if (ROOT_ID.equals(parentId)) {
            // Fetch queue from our custom plugin
            QueuePlugin queuePlugin = QueuePlugin.getInstance();
            if (queuePlugin != null) {
                Log.d(TAG, "QueuePlugin is not null");
                JSArray queue = queuePlugin.getQueue();
                if (queue != null) {
                    Log.d(TAG, "Queue size: " + queue.length());
                    try {
                        for (int i = 0; i < queue.length(); i++) {
                            JSONObject item = queue.getJSONObject(i);
                            String id = item.optString("id");
                            String title = item.optString("title");
                            String subtitle = item.optString("feedTitle"); // Or whatever makes sense
                            String imageUrl = item.optString("imageUrl");
                            String mediaUrl = item.optString("mediaUrl");

                            MediaDescriptionCompat.Builder descriptionBuilder = new MediaDescriptionCompat.Builder()
                                    .setMediaId(id)
                                    .setTitle(title)
                                    .setSubtitle(subtitle);

                            if (imageUrl != null && !imageUrl.isEmpty()) {
                                descriptionBuilder.setIconUri(Uri.parse(imageUrl));
                            }
                            if (mediaUrl != null && !mediaUrl.isEmpty()) {
                                descriptionBuilder.setMediaUri(Uri.parse(mediaUrl));
                            }

                            MediaDescriptionCompat description = descriptionBuilder.build();
                            mediaItems.add(new MediaBrowserCompat.MediaItem(description, MediaBrowserCompat.MediaItem.FLAG_PLAYABLE));
                        }
                    } catch (Exception e) {
                        Log.e(TAG, "Error parsing queue", e);
                    }
                } else {
                    Log.d(TAG, "Queue is null");
                }
            } else {
                Log.d(TAG, "QueuePlugin is null");
            }
        }
        
        result.sendResult(mediaItems);
    }
}
