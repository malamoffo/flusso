# 🌊 Flusso - Your Modern RSS Reader

[![Build Web App](https://github.com/malamoffo/flusso/actions/workflows/android.yml/badge.svg)](https://github.com/malamoffo/flusso/actions/workflows/android.yml)
[![Latest Release](https://img.shields.io/github/v/release/malamoffo/flusso)](https://github.com/malamoffo/flusso/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Flusso** is a fast, privacy-focused, and highly customizable news reader designed to provide a superior reading experience on both web and mobile devices.
 
---

## ✨ Advanced Features

### 🛠️ Smart Widgets & Dynamic Header
*   **Real-time Weather**: Integrated weather widget that automatically detects your location to provide current conditions.
*   **Synchronized Clock**: A minimalist design that integrates time and weather directly into your news flow.

### 🎙️ Radio & Audio Experience (New!)
*   **Live Radio Streaming**: Access thousands of Italian and international radio stations via the *Radio-Browser API*.
*   **Continuous Playback**: Listen to your favorite stations even with the screen off or app in background.
*   **Native Media Controls**: Full integration with Android/iOS media sessions for playback management from notifications and lock screen.
*   **Smart Favorites**: Pin your most-listened stations to the top of the list for instant access.
*   **Search & Discover**: Filter stations by name, tag, or category with a dedicated search interface.
*   **Visual Feedback**: Red-themed audio interface with dynamic loading states and high-quality favicons.

### 🤖 Reddit & Telegram Integration
*   **Subreddit Support**: Follow your favorite subreddits directly within Flusso with dedicated purple-themed UI.
*   **Telegram Channels**: Stay updated with public Telegram channels with a native green-themed experience.
*   **On-Demand Content**: Load Reddit comments and full Telegram threads only when needed to save data.
*   **Smart Retention**: Customizable retention policies to keep your feeds fast and relevant.

### 📖 Immersive Reading Experience
*   **Smart Feed Discovery**: Simply enter a website URL, and Flusso will automatically find the RSS/Atom feed for you.
*   **Distraction-Free Mode**: Automatic content extraction via *Mozilla Readability* for a clean and consistent reading experience.
*   **Search & Organization**: Integrated search engine to quickly find articles across all your feeds.
*   **Ambient Background**: Dynamic but static color blobs and glows that provide depth without distracting from content.
*   **Smart Prefetching**: Articles are pre-loaded in the background to ensure instant opening, even offline.
*   **Uncompromised Images**: Optimized display of full-height images (no cropping) in both the preview and the full article.
*   **Vertical Navigation**: Swipe up and down in the article reader to seamlessly move between articles.
*   **Visual Polish**: Elegant gradient borders with fading glow effects between list items for a premium feel.

### 🎨 Extreme Customization
*   **OLED Ready**: Includes the **Pure Black** theme for maximum energy savings on AMOLED screens.
*   **Variable Typography**: Support for Sans-serif (Inter) fonts with adjustable sizes from *Small* to *X-Large*.
*   **Intuitive Gestures**: Customizable swipe actions to mark as read or add to favorites with a single touch.
*   **OPML Import/Merge**: Support for both replacing existing feeds or merging new ones from OPML files.
*   **Organized Subscriptions**: Collapsible accordion sections for Articles, Podcasts, and Subreddits to keep your settings clean.

### 🚀 Technology & Performance
*   **Offline First**: All feeds and articles are saved locally via *IndexedDB*.
*   **Android Native**: Custom icons and splash screens for a smooth native app experience powered by *Capacitor*.
*   **Automated CI/CD**: Automatic builds for every Pull Request and automated releases via GitHub Actions.
*   **In-App Updates**: Stay up to date with the latest features! Flusso now automatically checks for new releases on GitHub and allows you to update directly from the settings.
*   **Robust Fetching**: Advanced multi-proxy system with automatic failover and JSON validation for maximum reliability.
*   **Error Logging**: Dedicated error log section in "About Flusso" to help diagnose and fix issues without cluttering the main UI.

---

## 🛠️ Tech Stack

*   **Frontend**: React 19 + TypeScript
*   **Styling**: Tailwind CSS 4.0 (Modern Utility-First)
*   **Animations**: Framer Motion (Fluid transitions and visual haptic feedback)
*   **Storage**: idb-keyval (IndexedDB)
*   **Native Bridge**: Capacitor (Access to native Android/iOS APIs)
*   **Media Session**: @capgo/capacitor-media-session (Lock screen audio controls)
*   **Content Engine**: @mozilla/readability

---

## 📱 Installation & Development

### Requirements
*   Node.js (v18+)
*   npm

### Local Setup
```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

### Android Build
```bash
# Generate production build
npm run build

# Sync with Android project
npx cap sync android
```

---

## 🛡️ Privacy & Security
Flusso does not track your reading habits. All your feed data remains on your device. Images are loaded with `referrerPolicy="no-referrer"` to protect your identity while browsing.

---
*Developed with ❤️ for a better reading experience.*
