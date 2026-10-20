# 🌊 Flusso - Your Modern RSS & News Reader

[![Build Web App](https://github.com/malamoffo/flusso/actions/workflows/android.yml/badge.svg)](https://github.com/malamoffo/flusso/actions/workflows/android.yml)
[![Latest Release](https://img.shields.io/github/v/release/malamoffo/flusso)](https://github.com/malamoffo/flusso/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Flusso** is a fast, privacy-focused, and highly customizable news and RSS reader designed for both web and Android devices. It combines traditional RSS/Atom feed subscriptions with subreddit integration, an offline-first storage architecture, and an distraction-free reading experience.

---

## ✨ Features

### 🧭 Clean 4-Section Architecture
The bottom navigation bar features evenly spaced, quick-access sections with ambient dynamic lighting:
*   ⭐ **Saved (Preferiti)**: Curated collection of bookmarked articles and saved Reddit posts, filterable by read/unread status.
*   📥 **Inbox (Flusso Notizie)**: Unified stream of all your subscribed RSS/Atom articles, with fast pull-to-refresh, auto-mark-as-read on scroll, and custom search.
*   💬 **Reddit**: Native subreddit reader with hot/new/top sorting, thumbnail previews, and a deep discussion viewer with collapsible nested comment trees.
*   ⚙️ **Settings (Impostazioni)**: Full control over feeds, OPML import/export, reading preferences, theme accents, and data retention.

### 🤖 Resilient Reddit Integration
*   **Atom/RSS Engine**: Uses Reddit's official Atom/RSS feed streams to reliably fetch posts without being blocked by 403 Forbidden unauthenticated JSON API restrictions.
*   **Rate-Limit Protection**: Sequential fetching with backoff intervals and compliant User-Agent headers (`<platform>:<app_id>:<version> (by /u/<username>)`) to avoid 429 Too Many Requests.
*   **Threaded Comment Viewer**: Read Reddit comment threads with support for up to 20 levels of nesting, with an intelligent indentation cap (after level 3) designed for optimal mobile screen readability.
*   **Timestamp Normalization & Smart Retention**: Millisecond-accurate timestamp handling with configurable retention (default 3 days), ensuring favorite and active posts are preserved.

### 📖 Distraction-Free Reading
*   **Smart Feed Discovery**: Enter any website URL or domain to automatically discover and subscribe to valid RSS or Atom feeds.
*   **Article Reader Mode**: Clean, ad-free article extraction powered by *@mozilla/readability* and *DOMPurify*.
*   **Image Viewer**: Full-screen zoomable image viewer with pinch-to-zoom and pan support.
*   **Ambient Glows (SectionGlow)**: Subtle, GPU-accelerated backdrop glows tailored to each section (Golden Amber for Saved, Electric Blue for Inbox, Cosmic Violet for Reddit).
*   **Swipe Gestures**: Swipe left or right on article cards to toggle read status or bookmark to favorites.

### 🎨 Customization & Theming
*   **OLED Pure Black**: Complete dark mode optimized for AMOLED battery saving.
*   **Accent Color Themes**: Customizable accent colors (Blue, Purple, Emerald, Amber, Rose, etc.).
*   **Typography Controls**: Adjustable font scale (*Small*, *Medium*, *Large*, *X-Large*).
*   **OPML Management**: Import and export standard OPML subscription lists, with options to merge with existing feeds or replace them.
*   **Collapsible Subscriptions**: Categorized management for RSS feeds and subreddits.

### 🚀 Performance & Architecture
*   **Offline-First**: All feeds, articles, posts, and user states are stored locally via *Dexie.js* (IndexedDB).
*   **Dedicated Web Worker**: Heavy sorting, deduplication, and list merging are handled in `dataProcessor.worker.ts` off the main thread.
*   **Native Android Integration**: Built with *Capacitor 6*, featuring native HTTP handling (`CapacitorHttp`), hardware back button management, and in-app browser capabilities.
*   **Diagnostics & Error Logging**: Built-in error logger in "About Flusso" to troubleshoot connection and feed parsing issues locally.

---

## 🛠️ Tech Stack

*   **Frontend**: React 19 + TypeScript + Vite
*   **Styling**: Tailwind CSS v4.0
*   **Animations & Gestures**: Framer Motion
*   **Database**: Dexie.js (IndexedDB wrapper) + `dexie-react-hooks`
*   **Concurrency**: Dedicated Web Worker (`dataProcessor.worker.ts`)
*   **Content Engine**: `@mozilla/readability`, `dompurify`, `he`
*   **Native Bridge**: Capacitor 6 (`@capacitor/core`, `@capacitor/android`, `@capacitor/browser`, `@capacitor/app`)
*   **Testing**: Vitest (34 unit & performance benchmark tests)

---

## 📱 Installation & Development

### Prerequisites
*   Node.js (v18+)
*   npm

### Local Development
```bash
# Install dependencies
npm install

# Start Vite development server
npm run dev
```

### Run Tests & Verification
```bash
# Run unit and performance tests
npm test

# Type checking
npm run lint

# Production build
npm run build
```

### Android Sync & Build
```bash
# Build web assets and sync with native Android shell
npm run build
npx cap sync android

# Open Android Studio
npx cap open android
```

---

## 🛡️ Privacy & Security
Flusso does not track your reading habits, require cloud account creation, or send telemetry to external servers. All feeds, credentials, and articles remain exclusively on your device. Images are fetched using `referrerPolicy="no-referrer"` to protect your identity while browsing.

---

*Flusso — Semplice, veloce e senza distrazioni.*
