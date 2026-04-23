package com.flusso.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.support.v4.media.MediaBrowserCompat;
import android.support.v4.media.MediaDescriptionCompat;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import androidx.media.MediaBrowserServiceCompat;
import androidx.media.app.NotificationCompat.MediaStyle;
import androidx.media.session.MediaButtonReceiver;

import com.getcapacitor.JSArray;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

public class AndroidAutoService extends MediaBrowserServiceCompat {

    private static final String TAG = "AndroidAutoService";
    private static final String ROOT_ID = "root";
    private static final String QUEUE_ID = "queue";
    private static final String FAVORITES_ID = "favorites";
    private static final String CHANNEL_ID = "flusso_playback";
    private static final int NOTIFICATION_ID = 1001;

    private static AndroidAutoService instance;

    private MediaSessionCompat mediaSession;
    private NotificationManager notificationManager;
    private String currentMediaId = null;
    private String currentTitle = "Flusso";
    private String currentArtist = "";
    private String currentAlbum = "Flusso";
    private String currentArtwork = "";
    private String currentArtworkFilename = "";
    private long currentPositionMs = 0L;
    private long currentDurationMs = 0L;
    private boolean currentPlaying = false;
    private boolean isForeground = false;

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
        notificationManager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);

        createNotificationChannel();

        mediaSession = new MediaSessionCompat(this, TAG);
        mediaSession.setFlags(
                MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS |
                MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS
        );

        Intent launchIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (launchIntent != null) {
            PendingIntent pendingIntent = PendingIntent.getActivity(
                    this, 0, launchIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            mediaSession.setSessionActivity(pendingIntent);
        }

        mediaSession.setCallback(new MediaSessionCompat.Callback() {
            @Override
            public void onPlay() {
                QueuePlugin plugin = (QueuePlugin) QueuePlugin.getInstance();
                if (plugin != null) plugin.triggerActionRequest("play");
                setPlaybackState(PlaybackStateCompat.STATE_PLAYING, currentPositionMs, true);
                updateNotification();
            }

            @Override
            public void onPause() {
                QueuePlugin plugin = (QueuePlugin) QueuePlugin.getInstance();
                if (plugin != null) plugin.triggerActionRequest("pause");
                setPlaybackState(PlaybackStateCompat.STATE_PAUSED, currentPositionMs, false);
                updateNotification();
            }

            @Override
            public void onStop() {
                QueuePlugin plugin = (QueuePlugin) QueuePlugin.getInstance();
                if (plugin != null) plugin.triggerActionRequest("stop");
                setPlaybackState(PlaybackStateCompat.STATE_STOPPED, currentPositionMs, false);
                stopForegroundCompat();
            }

            @Override
            public void onSkipToNext() {
                QueuePlugin plugin = (QueuePlugin) QueuePlugin.getInstance();
                if (plugin != null) plugin.triggerActionRequest("next");
            }

            @Override
            public void onSkipToPrevious() {
                QueuePlugin plugin = (QueuePlugin) QueuePlugin.getInstance();
                if (plugin != null) plugin.triggerActionRequest("previous");
            }

            @Override
            public void onSeekTo(long pos) {
                currentPositionMs = pos;
                QueuePlugin plugin = (QueuePlugin) QueuePlugin.getInstance();
                if (plugin != null) plugin.triggerSeekRequest(pos / 1000.0);
                setPlaybackState(
                        currentPlaying ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED,
                        currentPositionMs,
                        currentPlaying
                );
            }

            @Override
            public void onPlayFromMediaId(String mediaId, Bundle extras) {
                currentMediaId = mediaId;

                JSONObject track = findTrackById(mediaId);
                if (track != null) {
                    currentTitle = track.optString("title", "Sconosciuto");
                    currentArtist = track.optString("artist", "");
                    currentAlbum = track.optString("album", "Flusso");
                    currentArtwork = track.optString("artwork", "");
                    currentArtworkFilename = track.optString("artworkFilename", "");
                    currentDurationMs = track.optLong("duration", 0L) * 1000L;
                    updateMetadataFromTrack(track);
                }

                setPlaybackState(PlaybackStateCompat.STATE_BUFFERING, 0L, false);

                QueuePlugin plugin = (QueuePlugin) QueuePlugin.getInstance();
                if (plugin != null) {
                    plugin.triggerPlayRequest(mediaId);
                } else {
                    QueuePlugin.setPendingMediaId(mediaId);
                }

                startForegroundCompat();
                updateNotification();
            }
        });

        mediaSession.setPlaybackState(
                new PlaybackStateCompat.Builder()
                        .setActions(supportedActions())
                        .setState(PlaybackStateCompat.STATE_NONE, 0, 1.0f)
                        .build()
        );

        mediaSession.setActive(true);
        setSessionToken(mediaSession.getSessionToken());
        MediaSessionRegistry.getInstance().setSessionToken(mediaSession.getSessionToken());

        Log.d(TAG, "AndroidAutoService onCreate complete");
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        MediaButtonReceiver.handleIntent(mediaSession, intent);
        return START_STICKY;
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
    public BrowserRoot onGetRoot(@NonNull String clientPackageName,
                                 int clientUid,
                                 @Nullable Bundle rootHints) {
        Bundle extras = new Bundle();
        extras.putBoolean(BrowserRoot.EXTRA_RECENT, true);
        extras.putBoolean(BrowserRoot.EXTRA_OFFLINE, true);
        extras.putBoolean(BrowserRoot.EXTRA_SUGGESTED, true);
        return new BrowserRoot(ROOT_ID, extras);
    }

    @Override
    public void onLoadChildren(@NonNull final String parentId,
                               @NonNull final Result<List<MediaBrowserCompat.MediaItem>> result) {
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

    // ─── chiamata da QueuePlugin.java ─────────────────────────────────────────

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

        if (mediaId != null && !mediaId.isEmpty()) currentMediaId = mediaId;
        if (title != null)          currentTitle = title;
        if (artist != null)         currentArtist = artist;
        if (album != null)          currentAlbum = album;
        if (artwork != null)        currentArtwork = artwork;
        if (artworkFilename != null) currentArtworkFilename = artworkFilename;

        currentDurationMs = duration  != null ? (long) (duration  * 1000) : currentDurationMs;
        currentPositionMs = position  != null ? (long) (position  * 1000) : currentPositionMs;
        currentPlaying    = isPlaying != null ? isPlaying : currentPlaying;

        MediaMetadataCompat.Builder metaBuilder = new MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_MEDIA_ID, currentMediaId)
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE,    safe(currentTitle))
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST,   safe(currentArtist))
                .putString(MediaMetadataCompat.METADATA_KEY_ALBUM,    safe(currentAlbum));

        if (currentDurationMs > 0) {
            metaBuilder.putLong(MediaMetadataCompat.METADATA_KEY_DURATION, currentDurationMs);
        }

        Uri artUri = resolveArtworkUri(currentArtworkFilename, currentArtwork);
        if (artUri != null) {
            metaBuilder.putString(MediaMetadataCompat.METADATA_KEY_ALBUM_ART_URI,    artUri.toString());
            metaBuilder.putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_ICON_URI, artUri.toString());
        }

        mediaSession.setMetadata(metaBuilder.build());

        setPlaybackState(
                currentPlaying ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED,
                currentPositionMs,
                currentPlaying
        );

        if (currentPlaying) {
            startForegroundCompat();
        }

        updateNotification();
    }

    // ─── Notification ─────────────────────────────────────────────────────────

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Flusso Playback",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Controlli riproduzione podcast");
            channel.setShowBadge(false);
            channel.setSound(null, null);
            notificationManager.createNotificationChannel(channel);
        }
    }

    private Notification buildNotification() {
        if (mediaSession == null) return null;

        NotificationCompat.Action prevAction = new NotificationCompat.Action(
                android.R.drawable.ic_media_previous,
                "Precedente",
                MediaButtonReceiver.buildMediaButtonPendingIntent(
                        this, PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS)
        );

        NotificationCompat.Action playPauseAction = currentPlaying
                ? new NotificationCompat.Action(
                        android.R.drawable.ic_media_pause,
                        "Pausa",
                        MediaButtonReceiver.buildMediaButtonPendingIntent(
                                this, PlaybackStateCompat.ACTION_PAUSE))
                : new NotificationCompat.Action(
                        android.R.drawable.ic_media_play,
                        "Play",
                        MediaButtonReceiver.buildMediaButtonPendingIntent(
                                this, PlaybackStateCompat.ACTION_PLAY));

        NotificationCompat.Action nextAction = new NotificationCompat.Action(
                android.R.drawable.ic_media_next,
                "Successivo",
                MediaButtonReceiver.buildMediaButtonPendingIntent(
                        this, PlaybackStateCompat.ACTION_SKIP_TO_NEXT)
        );

        PendingIntent stopIntent = MediaButtonReceiver.buildMediaButtonPendingIntent(
                this, PlaybackStateCompat.ACTION_STOP);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(safe(currentTitle))
                .setContentText(safe(currentArtist))
                .setSubText(safe(currentAlbum))
                .setSmallIcon(R.mipmap.ic_launcher)
                .setDeleteIntent(stopIntent)
                .setContentIntent(mediaSession.getController().getSessionActivity())
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOnlyAlertOnce(true)
                .setOngoing(currentPlaying)
                .addAction(prevAction)
                .addAction(playPauseAction)
                .addAction(nextAction)
                .setStyle(new MediaStyle()
                        .setMediaSession(mediaSession.getSessionToken())
                        .setShowActionsInCompactView(0, 1, 2)
                        .setShowCancelButton(true)
                        .setCancelButtonIntent(stopIntent)
                );

        Uri artUri = resolveArtworkUri(currentArtworkFilename, currentArtwork);
        if (artUri != null) {
            builder.setLargeIcon(
                    android.graphics.BitmapFactory.decodeFile(
                            resolveArtworkLocalPath(currentArtworkFilename)
                    )
            );
        }

        builder.setColor(0xFF01696F); // teal Flusso, coerente col tema app

        return builder.build();
    }

    private void updateNotification() {
        Notification notification = buildNotification();
        if (notification == null) return;

        if (!isForeground && currentPlaying) {
            startForegroundCompat();
            return;
        }

        notificationManager.notify(NOTIFICATION_ID, notification);
    }

    private void startForegroundCompat() {
        Notification notification = buildNotification();
        if (notification == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
            );
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        isForeground = true;
        Log.d(TAG, "startForeground called");
    }

    private void stopForegroundCompat() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }
        isForeground = false;
    }

    // ─── Playback state ───────────────────────────────────────────────────────

    private void setPlaybackState(int state, long positionMs, boolean playing) {
        currentPlaying    = playing;
        currentPositionMs = positionMs;

        if (mediaSession == null) return;

        mediaSession.setPlaybackState(
                new PlaybackStateCompat.Builder()
                        .setActions(supportedActions())
                        .setState(state, positionMs, playing ? 1.0f : 0.0f)
                        .build()
        );
    }

    private long supportedActions() {
        return PlaybackStateCompat.ACTION_PLAY
                | PlaybackStateCompat.ACTION_PAUSE
                | PlaybackStateCompat.ACTION_STOP
                | PlaybackStateCompat.ACTION_PLAY_PAUSE
                | PlaybackStateCompat.ACTION_PLAY_FROM_MEDIA_ID
                | PlaybackStateCompat.ACTION_SKIP_TO_NEXT
                | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
                | PlaybackStateCompat.ACTION_SEEK_TO;
    }

    // ─── Artwork helpers ──────────────────────────────────────────────────────

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
        } catch (Exception ignored) {}

        try {
            return Uri.parse("android.resource://" + getPackageName() + "/" + R.mipmap.ic_launcher);
        } catch (Exception ignored) {
            return null;
        }
    }

    private String resolveArtworkLocalPath(String artworkFilename) {
        if (artworkFilename == null || artworkFilename.isEmpty()) return null;
        java.io.File imageFile = new java.io.File(getFilesDir(), "image_cache/" + artworkFilename);
        return imageFile.exists() ? imageFile.getAbsolutePath() : null;
    }

    // ─── Track helpers ────────────────────────────────────────────────────────

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
        long durationMs = track.optLong("duration", 0L) * 1000L;
        currentDurationMs = durationMs;

        Uri artUri = resolveArtworkUri(
                track.optString("artworkFilename"),
                track.optString("artwork")
        );

        MediaMetadataCompat.Builder builder = new MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_MEDIA_ID, track.optString("id"))
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE,    track.optString("title"))
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST,   track.optString("artist"))
                .putString(MediaMetadataCompat.METADATA_KEY_ALBUM,    track.optString("album"));

        if (durationMs > 0) {
            builder.putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationMs);
        }

        if (artUri != null) {
            builder.putString(MediaMetadataCompat.METADATA_KEY_ALBUM_ART_URI,    artUri.toString());
            builder.putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_ICON_URI, artUri.toString());
        }

        if (mediaSession != null) {
            mediaSession.setMetadata(builder.build());
        }
    }

    private MediaBrowserCompat.MediaItem buildPlayableItem(JSONObject item, int fallbackIndex) {
        String id = item.optString("id");
        if (id == null || id.isEmpty()) id = "unknown_" + fallbackIndex;

        String title = item.optString("title");
        if (title == null || title.isEmpty()) title = "Sconosciuto";

        String subtitle = item.optString("artist");

        MediaDescriptionCompat.Builder description = new MediaDescriptionCompat.Builder()
                .setMediaId(id)
                .setTitle(title)
                .setSubtitle(subtitle);

        Uri artUri = resolveArtworkUri(
                item.optString("artworkFilename"),
                item.optString("artwork")
        );
        if (artUri != null) {
            description.setIconUri(artUri);
        }

        return new MediaBrowserCompat.MediaItem(
                description.build(),
                MediaBrowserCompat.MediaItem.FLAG_PLAYABLE
        );
    }

    private String safe(String value) {
        return value != null ? value : "";
    }
}