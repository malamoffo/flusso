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
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
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
    private static final String QUEUE_ID = "queue";
    private static final String RECENT_ID = "recent";
    private static final String FAVORITES_ID = "favorites";
    private MediaSessionCompat proxySession;
    private boolean isBound = false;

    private ServiceConnection connection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName className, IBinder service) {
            try {
                // Get the MediaSessionService instance from the binder
                Method getServiceMethod = service.getClass().getDeclaredMethod("getService");
                getServiceMethod.setAccessible(true);
                Object mediaSessionService = getServiceMethod.invoke(service);
                
                // Helper to find field in hierarchy
                Field field = null;
                Class<?> current = mediaSessionService.getClass();
                while (current != null && field == null) {
                    try {
                        field = current.getDeclaredField("mediaSession");
                    } catch (NoSuchFieldException e) {
                        current = current.getSuperclass();
                    }
                }
                
                if (field != null) {
                    field.setAccessible(true);
                    MediaSessionCompat mediaSession = (MediaSessionCompat) field.get(mediaSessionService);
                    
                    if (mediaSession != null) {
                        Log.d(TAG, "Found Capgo MediaSession");
                        
                        // Sync state from Capgo session to our proxy session
                        try {
                            android.support.v4.media.session.MediaControllerCompat controller = 
                                new android.support.v4.media.session.MediaControllerCompat(AndroidAutoService.this, mediaSession.getSessionToken());
                            
                            // Initial sync
                            PlaybackStateCompat currentState = controller.getPlaybackState();
                            proxySession.setPlaybackState(currentState);
                            proxySession.setMetadata(controller.getMetadata());
                            
                            if (currentState == null || currentState.getState() != PlaybackStateCompat.STATE_PLAYING) {
                                // Not playing, start from queue
                                JSArray queue = QueuePlugin.getStaticQueue(AndroidAutoService.this);
                                if (queue != null && queue.length() > 0) {
                                    try {
                                        JSONObject firstItem = queue.getJSONObject(0);
                                        String mediaId = firstItem.optString("id");
                                        if (mediaId != null && !mediaId.isEmpty()) {
                                            QueuePlugin queuePlugin = QueuePlugin.getInstance();
                                            if (queuePlugin != null) {
                                                queuePlugin.triggerPlayRequest(mediaId);
                                            } else {
                                                startAppWithMediaId(mediaId);
                                            }
                                        }
                                    } catch (Exception e) {
                                        Log.e(TAG, "Failed to auto-play first item", e);
                                    }
                                }
                            }
                            
                            // Listen for changes
                            controller.registerCallback(new android.support.v4.media.session.MediaControllerCompat.Callback() {
                                @Override
                                public void onPlaybackStateChanged(PlaybackStateCompat state) {
                                    proxySession.setPlaybackState(state);
                                }
                                @Override
                                public void onMetadataChanged(MediaMetadataCompat metadata) {
                                    proxySession.setMetadata(metadata);
                                }
                            });
                        } catch (Exception e) {
                            Log.e(TAG, "Failed to create MediaControllerCompat", e);
                        }
                        
                        Field pluginField = null;
                        current = mediaSessionService.getClass();
                        while (current != null && pluginField == null) {
                            try {
                                pluginField = current.getDeclaredField("plugin");
                            } catch (NoSuchFieldException e) {
                                current = current.getSuperclass();
                            }
                        }

                        if (pluginField != null) {
                            pluginField.setAccessible(true);
                            final Object plugin = pluginField.get(mediaSessionService);
                            
                            final Method actionCallbackMethod = plugin.getClass().getDeclaredMethod("actionCallback", String.class);
                            actionCallbackMethod.setAccessible(true);

                            final Method actionCallbackWithDataMethod = plugin.getClass().getDeclaredMethod("actionCallback", String.class, JSObject.class);
                            actionCallbackWithDataMethod.setAccessible(true);

                            // Set callback on our proxy session to forward to plugin
                            proxySession.setCallback(new MediaSessionCompat.Callback() {
                                @Override
                                public void onPlayFromMediaId(String mediaId, Bundle extras) {
                                    super.onPlayFromMediaId(mediaId, extras);
                                    Log.d(TAG, "onPlayFromMediaId: " + mediaId);
                                    QueuePlugin queuePlugin = QueuePlugin.getInstance();
                                    if (queuePlugin != null) {
                                        queuePlugin.triggerPlayRequest(mediaId);
                                    } else {
                                        startAppWithMediaId(mediaId);
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
                    }
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

    private void startAppWithMediaId(String mediaId) {
        QueuePlugin.setPendingMediaId(mediaId);
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        intent.putExtra("play_media_id", mediaId);
        try {
            startActivity(intent);
        } catch (Exception e) {
            Log.e(TAG, "Failed to start activity", e);
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "onCreate - Inizializzazione servizio Android Auto");
        
        proxySession = new MediaSessionCompat(this, TAG);
        proxySession.setFlags(MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS | MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS);
        
        // Set a default callback immediately so the session is valid
        proxySession.setCallback(new MediaSessionCompat.Callback() {
            @Override
            public void onPlay() {
                super.onPlay();
            }
            @Override
            public void onPause() {
                super.onPause();
            }
            @Override
            public void onPlayFromMediaId(String mediaId, Bundle extras) {
                super.onPlayFromMediaId(mediaId, extras);
                Log.d(TAG, "Default onPlayFromMediaId: " + mediaId);
                startAppWithMediaId(mediaId);
            }
            @Override
            public void onPlayFromSearch(String query, Bundle extras) {
                super.onPlayFromSearch(query, extras);
                Log.d(TAG, "Default onPlayFromSearch: " + query);
            }
        });

        // Set session activity to launch the app when tapping the player
        Intent sessionIntent = new Intent(this, MainActivity.class);
        android.app.PendingIntent sessionActivity = android.app.PendingIntent.getActivity(this, 0, sessionIntent, android.app.PendingIntent.FLAG_IMMUTABLE);
        proxySession.setSessionActivity(sessionActivity);
        
        PlaybackStateCompat state = new PlaybackStateCompat.Builder()
                .setActions(PlaybackStateCompat.ACTION_PLAY | PlaybackStateCompat.ACTION_PLAY_PAUSE |
                        PlaybackStateCompat.ACTION_SKIP_TO_NEXT | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS |
                        PlaybackStateCompat.ACTION_PAUSE | PlaybackStateCompat.ACTION_STOP |
                        PlaybackStateCompat.ACTION_PLAY_FROM_MEDIA_ID | PlaybackStateCompat.ACTION_PLAY_FROM_SEARCH)
                .setState(PlaybackStateCompat.STATE_PAUSED, 0, 1.0f)
                .build();
        proxySession.setPlaybackState(state);
        
        MediaMetadataCompat metadata = new MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, "Flusso")
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, "Flusso")
                .build();
        proxySession.setMetadata(metadata);
        
        proxySession.setActive(true);
        setSessionToken(proxySession.getSessionToken());
        
        // Bind to the Capgo MediaSessionService to get the session token
        Intent intent = new Intent(this, MediaSessionService.class);
        try {
            isBound = bindService(intent, connection, Context.BIND_AUTO_CREATE);
            if (!isBound) {
                Log.e(TAG, "Impossibile effettuare il bind al MediaSessionService. Assicurati che sia dichiarato correttamente nel Manifest.");
            } else {
                Log.d(TAG, "Binding al MediaSessionService avviato con successo.");
            }
        } catch (Exception e) {
            Log.e(TAG, "Errore critico durante il bind al servizio MediaSessionService", e);
        }
    }

    @Override
    public void onDestroy() {
        Log.d(TAG, "onDestroy - Pulizia risorse");
        if (isBound) {
            try {
                unbindService(connection);
                Log.d(TAG, "Unbind dal servizio completato.");
            } catch (IllegalArgumentException e) {
                Log.e(TAG, "Errore durante l'unbind (servizio già non legato)", e);
            }
            isBound = false;
        }
        super.onDestroy();
    }

    @Nullable
    @Override
    public BrowserRoot onGetRoot(@NonNull String clientPackageName, int clientUid, @Nullable Bundle rootHints) {
        Log.d(TAG, "onGetRoot");
        Bundle extras = new Bundle();
        extras.putBoolean(BrowserRoot.EXTRA_RECENT, true);
        extras.putBoolean(BrowserRoot.EXTRA_OFFLINE, true);
        extras.putBoolean(BrowserRoot.EXTRA_SUGGESTED, true);
        return new BrowserRoot(ROOT_ID, extras);
    }

    @Override
    public void onLoadChildren(@NonNull final String parentId, @NonNull final Result<List<MediaBrowserCompat.MediaItem>> result) {
        Log.d(TAG, "onLoadChildren: " + parentId);
        result.detach();
        
        new Thread(new Runnable() {
            @Override
            public void run() {
                List<MediaBrowserCompat.MediaItem> mediaItems = new ArrayList<>();

                if (ROOT_ID.equals(parentId)) {
                    // Add a single folder at the root
                    mediaItems.add(new MediaBrowserCompat.MediaItem(
                            new MediaDescriptionCompat.Builder()
                                    .setMediaId(QUEUE_ID)
                                    .setTitle("Coda")
                                    .setSubtitle("I tuoi podcast preferiti e in coda")
                                    .build(), 
                            MediaBrowserCompat.MediaItem.FLAG_BROWSABLE));
                } else if (QUEUE_ID.equals(parentId)) {
                    // Fetch queue from our custom plugin using the static method
                    JSArray queue = QueuePlugin.getStaticQueue(AndroidAutoService.this);
                    
                    if (queue != null) {
                        Log.d(TAG, "Queue size for " + parentId + ": " + queue.length());
                        try {
                            for (int i = 0; i < queue.length(); i++) {
                                JSONObject item = queue.getJSONObject(i);
                                String id = item.optString("id");
                                if (id == null || id.isEmpty()) {
                                    id = "unknown_" + i;
                                }
                                String title = item.optString("title");
                                if (title == null || title.isEmpty()) {
                                    title = "Sconosciuto";
                                }
                                String subtitle = item.optString("artist"); // Use artist for subtitle
                                String imageUrl = item.optString("artwork"); // Use artwork for icon

                                MediaDescriptionCompat.Builder descriptionBuilder = new MediaDescriptionCompat.Builder()
                                        .setMediaId(id)
                                        .setTitle(title)
                                        .setSubtitle(subtitle);

                                if (imageUrl != null && !imageUrl.isEmpty()) {
                                    descriptionBuilder.setIconUri(Uri.parse(imageUrl));
                                }
                                
                                MediaDescriptionCompat description = descriptionBuilder.build();
                                mediaItems.add(new MediaBrowserCompat.MediaItem(description, MediaBrowserCompat.MediaItem.FLAG_PLAYABLE));
                            }
                        } catch (Exception e) {
                            Log.e(TAG, "Error parsing queue", e);
                        }
                    } else {
                        Log.d(TAG, "Queue is null for " + parentId);
                    }
                }
                
                result.sendResult(mediaItems);
            }
        }).start();
    }

    @Override
    public void onLoadChildren(@NonNull String parentId, @NonNull Result<List<MediaBrowserCompat.MediaItem>> result, @NonNull Bundle options) {
        // Android Auto sometimes calls this version
        onLoadChildren(parentId, result);
    }

    @Override
    public void onSearch(@NonNull String query, Bundle extras, @NonNull Result<List<MediaBrowserCompat.MediaItem>> result) {
        result.sendResult(new ArrayList<>());
    }
}
