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
        HttpURLConnection conn = null;
        InputStream in = null;
        try {
            String currentUrl = urlString;
            int redirectCount = 0;
            
            // Explicitly handle HTTP -> HTTPS redirects which HttpURLConnection does not do automatically
            while (redirectCount < 5) {
                URL url = new URL(currentUrl);
                conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(15000);
                conn.setInstanceFollowRedirects(true);
                conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
                conn.setRequestProperty("Accept", "application/rss+xml, application/xml, text/xml, */*");

                int status = conn.getResponseCode();
                if (status == HttpURLConnection.HTTP_MOVED_TEMP || 
                    status == HttpURLConnection.HTTP_MOVED_PERM || 
                    status == 307 || status == 308) {
                    String newUrl = conn.getHeaderField("Location");
                    if (newUrl != null && !newUrl.isEmpty()) {
                        currentUrl = newUrl;
                        redirectCount++;
                        conn.disconnect();
                        continue;
                    }
                }
                break;
            }

            in = conn.getInputStream();
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
                        // Only break if we successfully parsed a non-zero date.
                        // Failing to parse a specific item should let us check potential sibling items.
                        if (latestDate > 0) {
                            break;
                        }
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
            try {
                if (in != null) in.close();
            } catch (Exception ignored) {}
            try {
                if (conn != null) conn.disconnect();
            } catch (Exception ignored) {}
            return 0;
        }
    }

    private long parseDate(String dateStr) {
        if (dateStr == null) return 0;
        dateStr = dateStr.trim();

        // Standard RSS & Atom patterns
        String[] patterns = {
            "EEE, d MMM yyyy HH:mm:ss z",   // e.g. "Fri, 5 Jun 2026 19:57:38 GMT" (handles unpadded day d)
            "EEE, d MMM yyyy HH:mm:ss Z",   // e.g. "Fri, 5 Jun 2026 19:57:38 +0000"
            "EEE, d MMM yyyy HH:mm:ss",     // e.g. "Fri, 5 Jun 2026 19:57:38" (No timezone)
            "d MMM yyyy HH:mm:ss z",        // e.g. "5 Jun 2026 19:57:38 GMT"
            "d MMM yyyy HH:mm:ss Z",        // e.g. "5 Jun 2026 19:57:38 +0000"
            "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",   // Atom with milliseconds UTC
            "yyyy-MM-dd'T'HH:mm:ss.SSSZ",     // Atom with milliseconds and offset
            "yyyy-MM-dd'T'HH:mm:ss'Z'",       // Atom standard UTC
            "yyyy-MM-dd'T'HH:mm:ssZ",         // Atom standard offset
            "yyyy-MM-dd'T'HH:mm:ss",          // Atom standard no timezone
            "yyyy-MM-dd HH:mm:ss",            // Simple date time
            "yyyy-MM-dd"                      // Date only
        };

        // Try US English localization first (Standard for RSS/Atom specs)
        for (String pattern : patterns) {
            try {
                SimpleDateFormat sdf = new SimpleDateFormat(pattern, Locale.US);
                Date date = sdf.parse(dateStr);
                if (date != null) return date.getTime();
            } catch (Exception ignored) {}
        }

        // Try local system timezone as secondary fallback (helps with localized feeds)
        for (String pattern : patterns) {
            try {
                SimpleDateFormat sdf = new SimpleDateFormat(pattern, Locale.getDefault());
                Date date = sdf.parse(dateStr);
                if (date != null) return date.getTime();
            } catch (Exception ignored) {}
        }

        // Handle specific case of timezone offset with colons "yyyy-MM-dd'T'HH:mm:ss+HH:MM"
        // by removing the last colon from the offset if applicable.
        if (dateStr.length() > 6 && (dateStr.charAt(dateStr.length() - 3) == ':')) {
            char possibleSign = dateStr.charAt(dateStr.length() - 6);
            if (possibleSign == '+' || possibleSign == '-') {
                String cleanStr = dateStr.substring(0, dateStr.length() - 3) + dateStr.substring(dateStr.length() - 2);
                for (String pattern : patterns) {
                    try {
                        SimpleDateFormat sdf = new SimpleDateFormat(pattern, Locale.US);
                        Date date = sdf.parse(cleanStr);
                        if (date != null) return date.getTime();
                    } catch (Exception ignored) {}
                }
            }
        }

        Log.e(TAG, "Failed to parse date string: " + dateStr);
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
