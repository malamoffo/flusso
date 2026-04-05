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

    public void updateMetadata(String title, String artist, String url, String image) {
        if (player == null) return;
        
        MediaMetadata metadata = new MediaMetadata.Builder()
                .setTitle(title)
                .setArtist(artist)
                .setArtworkUri(Uri.parse(image))
                .build();

        MediaItem mediaItem = new MediaItem.Builder()
                .setMediaId(url)
                .setUri(url)
                .setMediaMetadata(metadata)
                .build();

        player.setMediaItem(mediaItem);
        player.prepare();
    }

    public void play() {
        if (player != null) player.play();
    }

    public void pause() {
        if (player != null) player.pause();
    }

    public void seek(long positionMs) {
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
        public ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> onGetChildren(
                MediaLibrarySession session, MediaSession.ControllerInfo browser, String parentId, int page, int pageSize, @Nullable LibraryParams params) {
            List<MediaItem> children = new ArrayList<>();
            if (parentId.equals("root")) {
                children.add(createBrowsableItem("favorites", "Preferiti", "I tuoi episodi salvati"));
                children.add(createBrowsableItem("recent", "Recenti", "Ultimi episodi ascoltati"));
            } else if (parentId.equals("favorites") || parentId.equals("recent")) {
                String key = parentId.equals("favorites") ? "favorites" : "recent";
                String json = getSharedPreferences("QueuePrefs", MODE_PRIVATE).getString(key, "[]");
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
                } catch (Exception e) {
                    Log.e(TAG, "Error parsing " + key, e);
                }
            }
            return Futures.immediateFuture(LibraryResult.ofItemList(ImmutableList.copyOf(children), params));
        }

        @Override
        public ListenableFuture<List<MediaItem>> onSetMediaItems(
                MediaSession session, MediaSession.ControllerInfo controller, List<MediaItem> mediaItems, int startIndex, long startPositionMs) {
            if (!mediaItems.isEmpty()) {
                MediaItem item = mediaItems.get(startIndex);
                Media3Plugin plugin = Media3Plugin.getInstance();
                if (plugin != null) {
                    plugin.notifyPlayRequest(item.mediaId);
                }
            }
            return Futures.immediateFuture(mediaItems);
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
