package com.flusso.app;

import android.net.Uri;
import android.os.Bundle;
import android.support.v4.media.MediaBrowserCompat;
import android.support.v4.media.MediaDescriptionCompat;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.media.MediaBrowserServiceCompat;

import com.getcapacitor.JSArray;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

public class AndroidAutoService extends MediaBrowserServiceCompat {

    private static final String TAG = "AndroidAutoService";
    private static final String ROOT_ID = "root";
    private static final String QUEUE_ID = "queue";
    private static final String FAVORITES_ID = "favorites";

    private static AndroidAutoService instance;

    private MediaSessionCompat mediaSession;
    private PlaybackStateCompat.Builder stateBuilder;

    private String currentMediaId = null;
    private long currentPositionMs = 0L;
    private long currentDurationMs = 0L;
    private boolean currentPlaying = false;

    public static AndroidAutoService getInstance() {
        return instance;
    }

    public static void notifyQueueChanged() {
        if (instance != null) {
            instance.notifyChildrenChanged(QUEUE_ID);
            instance.notifyChildrenChanged(FAVORITES_ID);
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;

        mediaSession = new MediaSessionCompat(this, TAG);
        mediaSession.setFlags(
                MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS |
                MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS
        );

        mediaSession.setCallback(new MediaSessionCompat.Callback() {
            @Override
            public void onPlay() {
                Log.d(TAG, "onPlay");
                QueuePlugin plugin = QueuePlugin.getInstance();
                if (plugin != null) {
                    plugin.triggerActionRequest("play");
                }
                updatePlaybackState(
                        PlaybackStateCompat.STATE_PLAYING,
                        currentPositionMs,
                        true
                );
            }

            @Override
            public void onPause() {
                Log.d(TAG, "onPause");
                QueuePlugin plugin = QueuePlugin.getInstance();
                if (plugin != null) {
                    plugin.triggerActionRequest("pause");
                }
                updatePlaybackState(
                        PlaybackStateCompat.STATE_PAUSED,
                        currentPositionMs,
                        false
                );
            }

            @Override
            public void onStop() {
                Log.d(TAG, "onStop");
                QueuePlugin plugin = QueuePlugin.getInstance();
                if (plugin != null) {
                    plugin.triggerActionRequest("stop");
                }
                updatePlaybackState(
                        PlaybackStateCompat.STATE_STOPPED,
                        currentPositionMs,
                        false
                );
                stopSelf();
            }

            @Override
            public void onSkipToNext() {
                Log.d(TAG, "onSkipToNext");
                QueuePlugin plugin = QueuePlugin.getInstance();
                if (plugin != null) {
                    plugin.triggerActionRequest("next");
                }
            }

            @Override
            public void onSkipToPrevious() {
                Log.d(TAG, "onSkipToPrevious");
                QueuePlugin plugin = QueuePlugin.getInstance();
                if (plugin != null) {
                    plugin.triggerActionRequest("previous");
                }
            }

            @Override
            public void onSeekTo(long pos) {
                Log.d(TAG, "onSeekTo: " + pos);
                currentPositionMs = pos;
                QueuePlugin plugin = QueuePlugin.getInstance();
                if (plugin != null) {
                    plugin.triggerSeekRequest(pos / 1000.0);
                }
                updatePlaybackState(
                        currentPlaying ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED,
                        currentPositionMs,
                        currentPlaying
                );
            }

            @Override
            public void onPlayFromMediaId(String mediaId, Bundle extras) {
                Log.d(TAG, "onPlayFromMediaId: " + mediaId);
                currentMediaId = mediaId;

                JSONObject track = findTrackById(mediaId);
                if (track != null) {
                    updateMetadataFromTrack(track);
                    updatePlaybackState(PlaybackStateCompat.STATE_BUFFERING, 0L, false);
                }

                QueuePlugin plugin = QueuePlugin.getInstance();
                if (plugin != null) {
                    plugin.triggerPlayRequest(mediaId);
                } else {
                    QueuePlugin.setPendingMediaId(mediaId);
                }
            }
        });

        stateBuilder = new PlaybackStateCompat.Builder()
                .setActions(
                        PlaybackStateCompat.ACTION_PLAY |
                        PlaybackStateCompat.ACTION_PAUSE |
                        PlaybackStateCompat.ACTION_STOP |
                        PlaybackStateCompat.ACTION_PLAY_PAUSE |
                        PlaybackStateCompat.ACTION_PLAY_FROM_MEDIA_ID |
                        PlaybackStateCompat.ACTION_SKIP_TO_NEXT |
                        PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS |
                        PlaybackStateCompat.ACTION_SEEK_TO
                );

        mediaSession.setPlaybackState(
                stateBuilder.setState(PlaybackStateCompat.STATE_NONE, 0, 1.0f).build()
        );
        mediaSession.setActive(true);

        setSessionToken(mediaSession.getSessionToken());
        MediaSessionRegistry.getInstance().setSessionToken(mediaSession.getSessionToken());

        Log.d(TAG, "Android Auto MediaSession initialized");
    }

    @Override
    public void onDestroy() {
        instance = null;
        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.release();
            mediaSession = null;
        }
        super.onDestroy();
    }

    @Nullable
    @Override
    public BrowserRoot onGetRoot(@NonNull String clientPackageName, int clientUid, @Nullable Bundle rootHints) {
        Log.d(TAG, "onGetRoot from " + clientPackageName);
        Bundle extras = new Bundle();
        extras.putBoolean(BrowserRoot.EXTRA_RECENT, true);
        extras.putBoolean(BrowserRoot.EXTRA_OFFLINE, true);
        extras.putBoolean(BrowserRoot.EXTRA_SUGGESTED, true);
        return new BrowserRoot(ROOT_ID, extras);
    }

    @Override
    public void onLoadChildren(@NonNull final String parentId,
                               @NonNull final Result<List<MediaBrowserCompat.MediaItem>> result) {
        Log.d(TAG, "onLoadChildren: " + parentId);
        result.detach();

        new Thread(() -> {
            List<MediaBrowserCompat.MediaItem> mediaItems = new ArrayList<>();

            if (ROOT_ID.equals(parentId)) {
                mediaItems.add(new MediaBrowserCompat.MediaItem(
                        new MediaDescriptionCompat.Builder()
                                .setMediaId(QUEUE_ID)
                                .setTitle("In riproduzione")
                                .setSubtitle("Coda corrente")
                                .build(),
                        MediaBrowserCompat.MediaItem.FLAG_BROWSABLE
                ));

                mediaItems.add(new MediaBrowserCompat.MediaItem(
                        new MediaDescriptionCompat.Builder()
                                .setMediaId(FAVORITES_ID)
                                .setTitle("Preferiti")
                                .setSubtitle("I tuoi podcast preferiti")
                                .build(),
                        MediaBrowserCompat.MediaItem.FLAG_BROWSABLE
                ));
            } else if (QUEUE_ID.equals(parentId) || FAVORITES_ID.equals(parentId)) {
                JSArray itemsArray = QUEUE_ID.equals(parentId)
                        ? QueuePlugin.getStaticQueue(AndroidAutoService.this)
                        : QueuePlugin.getStaticFavorites(AndroidAutoService.this);

                if (itemsArray != null) {
                    for (int i = 0; i < itemsArray.length(); i++) {
                        try {
                            JSONObject item = itemsArray.getJSONObject(i);
                            mediaItems.add(buildPlayableItem(item, i));
                        } catch (Exception e) {
                            Log.e(TAG, "Error parsing media item", e);
                        }
                    }
                }
            }

            result.sendResult(mediaItems);
        }).start();
    }

    @Override
    public void onLoadChildren(@NonNull String parentId,
                               @NonNull Result<List<MediaBrowserCompat.MediaItem>> result,
                               @NonNull Bundle options) {
        onLoadChildren(parentId, result);
    }

    @Override
    public void onSearch(@NonNull String query, Bundle extras,
                         @NonNull Result<List<MediaBrowserCompat.MediaItem>> result) {
        result.sendResult(new ArrayList<>());
    }

    public void updateSessionState(String mediaId,
                                   String title,
                                   String artist,
                                   String album,
                                   String artwork,
                                   String artworkFilename,
                                   Double duration,
                                   Double position,
                                   Boolean isPlaying) {
        if (mediaSession == null) return;

        if (mediaId != null && !mediaId.isEmpty()) {
            currentMediaId = mediaId;
        }

        currentDurationMs = duration != null ? (long) (duration * 1000) : 0L;
        currentPositionMs = position != null ? (long) (position * 1000) : 0L;
        currentPlaying = isPlaying != null && isPlaying;

        MediaMetadataCompat.Builder metaBuilder = new MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_MEDIA_ID, currentMediaId)
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, safe(title))
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, safe(artist))
                .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, safe(album));

        if (currentDurationMs > 0) {
            metaBuilder.putLong(MediaMetadataCompat.METADATA_KEY_DURATION, currentDurationMs);
        }

        Uri artUri = resolveArtworkUri(artworkFilename, artwork);
        if (artUri != null) {
            metaBuilder.putString(MediaMetadataCompat.METADATA_KEY_ALBUM_ART_URI, artUri.toString());
            metaBuilder.putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_ICON_URI, artUri.toString());
        }

        mediaSession.setMetadata(metaBuilder.build());

        int state = currentPlaying
                ? PlaybackStateCompat.STATE_PLAYING
                : PlaybackStateCompat.STATE_PAUSED;

        updatePlaybackState(state, currentPositionMs, currentPlaying);

        if (currentMediaId != null) {
            mediaSession.setQueue(buildQueueItemsFromCurrentQueue());
            mediaSession.setQueueTitle("Coda");
            try {
                mediaSession.setActiveQueueItemId(currentMediaId.hashCode());
            } catch (Exception ignored) {
            }
        }
    }

    private void updatePlaybackState(int state, long positionMs, boolean playing) {
        currentPlaying = playing;
        currentPositionMs = positionMs;

        PlaybackStateCompat.Builder builder = new PlaybackStateCompat.Builder()
                .setActions(
                        PlaybackStateCompat.ACTION_PLAY |
                        PlaybackStateCompat.ACTION_PAUSE |
                        PlaybackStateCompat.ACTION_STOP |
                        PlaybackStateCompat.ACTION_PLAY_PAUSE |
                        PlaybackStateCompat.ACTION_PLAY_FROM_MEDIA_ID |
                        PlaybackStateCompat.ACTION_SKIP_TO_NEXT |
                        PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS |
                        PlaybackStateCompat.ACTION_SEEK_TO
                )
                .setState(state, positionMs, playing ? 1.0f : 0.0f);

        mediaSession.setPlaybackState(builder.build());
    }

    private JSONObject findTrackById(String id) {
        JSArray[] queues = {
                QueuePlugin.getStaticQueue(this),
                QueuePlugin.getStaticFavorites(this)
        };

        for (JSArray queue : queues) {
            if (queue == null) continue;
            for (int i = 0; i < queue.length(); i++) {
                JSONObject item = queue.optJSONObject(i);
                if (item != null && id.equals(item.optString("id"))) {
                    return item;
                }
            }
        }
        return null;
    }

    private void updateMetadataFromTrack(JSONObject track) {
        String artwork = track.optString("artwork");
        String artworkFilename = track.optString("artworkFilename");
        long durationMs = track.optLong("duration", 0L) * 1000L;

        currentDurationMs = durationMs;

        MediaMetadataCompat.Builder builder = new MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_MEDIA_ID, track.optString("id"))
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, track.optString("title"))
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, track.optString("artist"))
                .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, track.optString("album"));

        if (durationMs > 0) {
            builder.putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationMs);
        }

        Uri artUri = resolveArtworkUri(artworkFilename, artwork);
        if (artUri != null) {
            builder.putString(MediaMetadataCompat.METADATA_KEY_ALBUM_ART_URI, artUri.toString());
            builder.putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_ICON_URI, artUri.toString());
        }

        mediaSession.setMetadata(builder.build());
    }

    private MediaBrowserCompat.MediaItem buildPlayableItem(JSONObject item, int fallbackIndex) {
        String id = item.optString("id");
        if (id == null || id.isEmpty()) id = "unknown_" + fallbackIndex;

        String title = item.optString("title");
        if (title == null || title.isEmpty()) title = "Sconosciuto";

        String subtitle = item.optString("artist");
        String artwork = item.optString("artwork");
        String artworkFilename = item.optString("artworkFilename");

        MediaDescriptionCompat.Builder description = new MediaDescriptionCompat.Builder()
                .setMediaId(id)
                .setTitle(title)
                .setSubtitle(subtitle);

        Uri artUri = resolveArtworkUri(artworkFilename, artwork);
        if (artUri != null) {
            description.setIconUri(artUri);
        }

        return new MediaBrowserCompat.MediaItem(
                description.build(),
                MediaBrowserCompat.MediaItem.FLAG_PLAYABLE
        );
    }

    private Uri resolveArtworkUri(String artworkFilename, String artworkUrl) {
        try {
            if (artworkFilename != null && !artworkFilename.isEmpty()) {
                java.io.File imageFile = new java.io.File(getFilesDir(), "image_cache/" + artworkFilename);
                if (imageFile.exists()) {
                    return androidx.core.content.FileProvider.getUriForFile(
                            this,
                            getPackageName() + ".fileprovider",
                            imageFile
                    );
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Error resolving local artwork uri", e);
        }

        try {
            if (artworkUrl != null && !artworkUrl.isEmpty()) {
                return Uri.parse(artworkUrl);
            }
        } catch (Exception ignored) {
        }

        return null;
    }

    private List<MediaSessionCompat.QueueItem> buildQueueItemsFromCurrentQueue() {
        List<MediaSessionCompat.QueueItem> queueItems = new ArrayList<>();
        JSArray queue = QueuePlugin.getStaticQueue(this);
        if (queue == null) return queueItems;

        for (int i = 0; i < queue.length(); i++) {
            try {
                JSONObject item = queue.getJSONObject(i);
                MediaDescriptionCompat description = new MediaDescriptionCompat.Builder()
                        .setMediaId(item.optString("id"))
                        .setTitle(item.optString("title"))
                        .setSubtitle(item.optString("artist"))
                        .build();

                queueItems.add(new MediaSessionCompat.QueueItem(description, item.optString("id").hashCode()));
            } catch (Exception e) {
                Log.e(TAG, "Error building queue item", e);
            }
        }
        return queueItems;
    }

    private String safe(String value) {
        return value != null ? value : "";
    }
}