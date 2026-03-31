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
                    
                    // Add a callback to handle play from media id
                    mediaSession.setCallback(new MediaSessionCompat.Callback() {
                        @Override
                        public void onPlayFromMediaId(String mediaId, Bundle extras) {
                            super.onPlayFromMediaId(mediaId, extras);
                            // We need to tell the web layer to play this item.
                            // The easiest way is to fire an event through our plugin.
                            QueuePlugin queuePlugin = QueuePlugin.getInstance();
                            if (queuePlugin != null) {
                                queuePlugin.triggerPlayRequest(mediaId);
                            } else {
                                Log.e(TAG, "QueuePlugin instance is null, cannot send playRequest");
                            }
                        }
                        
                        // We should also delegate other standard callbacks to the original ones if possible,
                        // but for now, just handling playFromMediaId is the most critical missing piece
                        // for selecting an item from the list.
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
