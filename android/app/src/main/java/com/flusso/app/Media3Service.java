package com.flusso.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import androidx.annotation.Nullable;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.LibraryResult;
import androidx.media3.session.MediaLibraryService;
import androidx.media3.session.MediaLibraryService.LibraryParams;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSession.MediaItemsWithStartPosition;
import com.google.common.collect.ImmutableList;
import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

public class Media3Service extends MediaLibraryService {
    private static final String TAG = "Media3Service";
    private MediaLibrarySession mediaLibrarySession;
    private ExoPlayer player;
    private static Media3Service instance;

    public static Media3Service getInstance() {
        return instance;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        Log.d(TAG, "onCreate");

        AudioAttributes audioAttributes = new AudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_SPEECH)
                .build();

        player = new ExoPlayer.Builder(this)
                .setAudioAttributes(audioAttributes, true)
                .build();

        player.addListener(new Player.Listener() {
            @Override
            public void onIsPlayingChanged(boolean isPlaying) {
                Media3Plugin plugin = Media3Plugin.getInstance();
                if (plugin != null) {
                    plugin.notifyPlaybackState(isPlaying);
                }
                if (isPlaying) {
                    startPositionUpdates();
                } else {
                    stopPositionUpdates();
                }
            }

            @Override
            public void onPlayerError(androidx.media3.common.PlaybackException error) {
                Log.e(TAG, "Player error: " + error.getMessage(), error);
            }
            
            @Override
            public void onPositionDiscontinuity(Player.PositionInfo oldPosition, Player.PositionInfo newPosition, int reason) {
                Media3Plugin plugin = Media3Plugin.getInstance();
                if (plugin != null) {
                   plugin.notifyPosition(newPosition.positionMs);
                }
            }
        });

        mediaLibrarySession = new MediaLibrarySession.Builder(this, player, new LibrarySessionCallback()).build();
    }

    private final Runnable positionUpdateRunnable = new Runnable() {
        @Override
        public void run() {
            if (player != null && player.isPlaying()) {
                Media3Plugin plugin = Media3Plugin.getInstance();
                if (plugin != null) {
                    plugin.notifyPosition(player.getCurrentPosition());
                }
                mainHandler.postDelayed(this, 1000);
            }
        }
    };

    private final android.os.Handler mainHandler = new android.os.Handler(android.os.Looper.getMainLooper());

    private void startPositionUpdates() {
        mainHandler.removeCallbacks(positionUpdateRunnable);
        mainHandler.post(positionUpdateRunnable);
    }

    private void stopPositionUpdates() {
        mainHandler.removeCallbacks(positionUpdateRunnable);
    }

    public void updateMetadata(String id, String title, String artist, String url, String image) {
        Log.d(TAG, "updateMetadata: " + title + " (id: " + id + "), url: " + url);
        if (player == null) return;
        
        MediaMetadata metadata = new MediaMetadata.Builder()
                .setTitle(title)
                .setArtist(artist)
                .setArtworkUri(Uri.parse(image))
                .build();

        MediaItem mediaItem = new MediaItem.Builder()
                .setMediaId(id)
                .setUri(url)
                .setMediaMetadata(metadata)
                .build();

        player.setMediaItem(mediaItem);
        player.prepare();
    }

    public void resetAndPlay() {
        Log.d(TAG, "resetAndPlay() called");
        if (player != null) {
            player.stop();
            player.prepare();
            player.addListener(new Player.Listener() {
                @Override
                public void onPlaybackStateChanged(int playbackState) {
                    if (playbackState == Player.STATE_READY) {
                        player.play();
                        player.removeListener(this);
                    }
                }
            });
        }
    }

    public void play() {
        Log.d(TAG, "play() called, state: " + player.getPlaybackState());
        if (player != null) {
            if (player.getPlaybackState() == Player.STATE_IDLE || player.getPlaybackState() == Player.STATE_BUFFERING) {
                if (player.getPlaybackState() == Player.STATE_IDLE) {
                    player.prepare();
                }
                player.addListener(new Player.Listener() {
                    @Override
                    public void onPlaybackStateChanged(int playbackState) {
                        if (playbackState == Player.STATE_READY) {
                            player.play();
                            player.removeListener(this);
                        }
                    }
                });
            } else {
                player.play();
            }
        }
    }

    public void pause() {
        Log.d(TAG, "pause() called");
        if (player != null) player.pause();
    }

    public void seek(long positionMs) {
        Log.d(TAG, "seek() to: " + positionMs);
        if (player != null) player.seekTo(positionMs);
    }

    @Nullable
    @Override
    public MediaLibrarySession onGetSession(MediaSession.ControllerInfo controllerInfo) {
        return mediaLibrarySession;
    }

    @Override
    public void onDestroy() {
        instance = null;
        if (player != null) {
            player.release();
        }
        if (mediaLibrarySession != null) {
            mediaLibrarySession.release();
        }
        super.onDestroy();
    }

    private class LibrarySessionCallback implements MediaLibrarySession.Callback {
        @Override
        public ListenableFuture<LibraryResult<MediaItem>> onGetLibraryRoot(
                MediaLibrarySession session, MediaSession.ControllerInfo browser, @Nullable LibraryParams params) {
            MediaMetadata metadata = new MediaMetadata.Builder()
                    .setIsBrowsable(true)
                    .setIsPlayable(false)
                    .build();
            MediaItem rootItem = new MediaItem.Builder()
                    .setMediaId("root")
                    .setMediaMetadata(metadata)
                    .build();
            return Futures.immediateFuture(LibraryResult.ofItem(rootItem, params));
        }

        @Override
        public ListenableFuture<LibraryResult<MediaItem>> onGetItem(
                MediaLibrarySession session, MediaSession.ControllerInfo browser, String mediaId) {
            Log.d(TAG, "onGetItem: " + mediaId);
            
            // Try to find the item in our collections
            String[] collections = {"favorites", "recent", "queue"};
            for (String key : collections) {
                String json = getSharedPreferences("QueuePrefs", MODE_PRIVATE).getString(key, "[]");
                try {
                    JSONArray array = new JSONArray(json);
                    for (int i = 0; i < array.length(); i++) {
                        JSONObject obj = array.getJSONObject(i);
                        if (obj.optString("id").equals(mediaId)) {
                            MediaItem item = createPlayableItem(
                                    obj.optString("id"),
                                    obj.optString("title"),
                                    obj.optString("artist"),
                                    obj.optString("artwork"),
                                    obj.optString("url")
                            );
                            return Futures.immediateFuture(LibraryResult.ofItem(item, null));
                        }
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Error parsing " + key, e);
                }
            }
            
            return Futures.immediateFuture(LibraryResult.ofError(LibraryResult.RESULT_ERROR_BAD_VALUE));
        }

        @Override
        public ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> onGetChildren(
                MediaLibrarySession session, MediaSession.ControllerInfo browser, String parentId, int page, int pageSize, @Nullable LibraryParams params) {
            Log.d(TAG, "onGetChildren: " + parentId + " (page: " + page + ", size: " + pageSize + ")");
            List<MediaItem> children = new ArrayList<>();
            if (parentId.equals("root")) {
                children.add(createBrowsableItem("favorites", "Preferiti", "I tuoi episodi salvati"));
                children.add(createBrowsableItem("recent", "Recenti", "Ultimi episodi ascoltati"));
                Log.d(TAG, "Returning root children: " + children.size());
            } else if (parentId.equals("favorites") || parentId.equals("recent")) {
                String key = parentId.equals("favorites") ? "favorites" : "recent";
                String json = getSharedPreferences("QueuePrefs", MODE_PRIVATE).getString(key, "[]");
                Log.d(TAG, "Loading " + key + " from prefs: " + json);
                try {
                    JSONArray array = new JSONArray(json);
                    for (int i = 0; i < array.length(); i++) {
                        JSONObject obj = array.getJSONObject(i);
                        children.add(createPlayableItem(
                                obj.optString("id", "item_" + i),
                                obj.optString("title", "Sconosciuto"),
                                obj.optString("artist", "Flusso"),
                                obj.optString("artwork", ""),
                                obj.optString("url", "")
                        ));
                    }
                    Log.d(TAG, "Returning " + key + " children: " + children.size());
                } catch (Exception e) {
                    Log.e(TAG, "Error parsing " + key, e);
                }
            }
            return Futures.immediateFuture(LibraryResult.ofItemList(ImmutableList.copyOf(children), params));
        }

        @Override
        public ListenableFuture<MediaItemsWithStartPosition> onSetMediaItems(
                MediaSession session, MediaSession.ControllerInfo controller, List<MediaItem> mediaItems, int startIndex, long startPositionMs) {
            if (!mediaItems.isEmpty()) {
                MediaItem item = mediaItems.get(startIndex);
                Media3Plugin plugin = Media3Plugin.getInstance();
                if (plugin != null) {
                    plugin.notifyPlayRequest(item.mediaId);
                }
            }
            return Futures.immediateFuture(new MediaItemsWithStartPosition(mediaItems, startIndex, startPositionMs));
        }
    }

    private MediaItem createBrowsableItem(String id, String title, String subtitle) {
        MediaMetadata metadata = new MediaMetadata.Builder()
                .setTitle(title)
                .setSubtitle(subtitle)
                .setIsBrowsable(true)
                .setIsPlayable(false)
                .build();
        return new MediaItem.Builder()
                .setMediaId(id)
                .setMediaMetadata(metadata)
                .build();
    }

    private MediaItem createPlayableItem(String id, String title, String artist, String imageUrl, String mediaUrl) {
        MediaMetadata metadata = new MediaMetadata.Builder()
                .setTitle(title)
                .setArtist(artist)
                .setIsBrowsable(false)
                .setIsPlayable(true)
                .setArtworkUri(Uri.parse(imageUrl))
                .build();
        return new MediaItem.Builder()
                .setMediaId(id)
                .setUri(Uri.parse(mediaUrl))
                .setMediaMetadata(metadata)
                .build();
    }
}
