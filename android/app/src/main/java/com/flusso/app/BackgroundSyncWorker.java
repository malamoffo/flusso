package com.flusso.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;
import org.xmlpull.v1.XmlPullParser;
import org.xmlpull.v1.XmlPullParserFactory;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class BackgroundSyncWorker extends Worker {

    private static final String TAG = "BackgroundSyncWorker";
    private static final String CHANNEL_ID = "flusso_updates";

    public BackgroundSyncWorker(@NonNull Context context, @NonNull WorkerParameters workerParams) {
        super(context, workerParams);
    }

    @NonNull
    @Override
    public Result doWork() {
        Log.d(TAG, "Starting background feed sync");
        Context context = getApplicationContext();
        SharedPreferences prefs = context.getSharedPreferences("FlussoBackgroundPrefs", Context.MODE_PRIVATE);
        String feedsJson = prefs.getString("feeds", "[]");

        int newArticlesCount = 0;
        JSONArray updatedFeeds = new JSONArray();

        try {
            JSONArray feeds = new JSONArray(feedsJson);
            for (int i = 0; i < feeds.length(); i++) {
                JSONObject feed = feeds.getJSONObject(i);
                String urlStr = feed.optString("url");
                long lastFetched = feed.optLong("lastFetched", 0);
                String title = feed.optString("title", "Podcast");

                if (urlStr.isEmpty()) {
                    updatedFeeds.put(feed);
                    continue;
                }

                long latestDate = fetchLatestArticleDate(urlStr);
                
                if (latestDate > lastFetched) {
                    newArticlesCount++;
                    feed.put("lastFetched", latestDate);
                }
                updatedFeeds.put(feed);
            }

            if (newArticlesCount > 0) {
                sendNotification(context, newArticlesCount);
                // Save updated dates
                prefs.edit().putString("feeds", updatedFeeds.toString()).apply();
            }

            return Result.success();
        } catch (Exception e) {
            Log.e(TAG, "Error in background sync", e);
            return Result.failure();
        }
    }

    private long fetchLatestArticleDate(String urlString) {
        try {
            URL url = new URL(urlString);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(10000);
            conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
            
            InputStream in = conn.getInputStream();
            XmlPullParserFactory factory = XmlPullParserFactory.newInstance();
            factory.setNamespaceAware(false);
            XmlPullParser parser = factory.newPullParser();
            parser.setInput(in, null);

            int eventType = parser.getEventType();
            boolean inItem = false;
            long latestDate = 0;

            while (eventType != XmlPullParser.END_DOCUMENT) {
                String name = parser.getName();
                if (eventType == XmlPullParser.START_TAG) {
                    if (name.equalsIgnoreCase("item") || name.equalsIgnoreCase("entry")) {
                        inItem = true;
                    } else if (inItem && (name.equalsIgnoreCase("pubDate") || name.equalsIgnoreCase("published") || name.equalsIgnoreCase("updated"))) {
                        String dateStr = parser.nextText();
                        Log.d(TAG, "DEBUG: Found date string in feed " + urlString + ": " + dateStr);
                        long date = parseDate(dateStr);
                        if (date > latestDate) {
                            latestDate = date;
                        }
                        // We only need the first item's date as feeds are usually sorted
                        break;
                    }
                } else if (eventType == XmlPullParser.END_TAG) {
                    if (name.equalsIgnoreCase("item") || name.equalsIgnoreCase("entry")) {
                        inItem = false;
                    }
                }
                eventType = parser.next();
            }
            in.close();
            conn.disconnect();
            Log.d(TAG, "DEBUG: Final latestDate for " + urlString + ": " + latestDate);
            return latestDate;
        } catch (Exception e) {
            Log.e(TAG, "Error fetching feed: " + urlString, e);
            return 0;
        }
    }

    private long parseDate(String dateStr) {
        try {
            // Try standard RSS format
            // 'Z' handles RFC 822 timezones like +0000 or -0500.
            SimpleDateFormat sdf = new SimpleDateFormat("EEE, dd MMM yyyy HH:mm:ss Z", Locale.US);
            Date date = sdf.parse(dateStr);
            if (date != null) return date.getTime();
        } catch (Exception e) {
            try {
                // Try Atom format (ISO 8601)
                SimpleDateFormat sdf2 = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US);
                Date date = sdf2.parse(dateStr);
                if (date != null) return date.getTime();
            } catch (Exception e2) {
                try {
                    // Try Atom format with timezone
                    SimpleDateFormat sdf3 = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssZ", Locale.US);
                    Date date = sdf3.parse(dateStr.replaceAll("([+-]\\d\\d):(\\d\\d)$", "$1$2"));
                    if (date != null) return date.getTime();
                } catch (Exception e3) {
                    Log.d(TAG, "DEBUG: Failed to parse date string: " + dateStr);
                    Log.e(TAG, "Failed to parse date: " + dateStr);
                }
            }
        }
        return 0;
    }

    private void sendNotification(Context context, int count) {
        NotificationManager notificationManager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Aggiornamenti Feed",
                    NotificationManager.IMPORTANCE_DEFAULT
            );
            channel.setDescription("Notifiche per nuovi episodi e articoli");
            notificationManager.createNotificationChannel(channel);
        }

        Intent intent = new Intent(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        PendingIntent pendingIntent = PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_IMMUTABLE);

        String message = count == 1 ? "C'è 1 nuovo contenuto disponibile!" : "Ci sono " + count + " nuovi contenuti disponibili!";

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_popup_sync)
                .setContentTitle("Nuovi aggiornamenti su Flusso")
                .setContentText(message)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setContentIntent(pendingIntent)
                .setAutoCancel(true);

        notificationManager.notify(1001, builder.build());
    }
}
