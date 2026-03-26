# 🌊 Flusso - Il Tuo Lettore RSS Moderno

**Flusso** è un lettore di notizie veloce, focalizzato sulla privacy e altamente personalizzabile, progettato per offrire un'esperienza di lettura superiore sia sul web che su dispositivi mobile.

---

## ✨ Funzionalità Avanzate

### 🛠️ Widget Intelligenti & Header Dinamico
*   **Meteo in Tempo Reale**: Widget meteo integrato che rileva automaticamente la tua posizione per fornirti le condizioni attuali.
*   **Orologio Sincronizzato**: Un design minimalista che integra ora e meteo direttamente nel flusso delle tue notizie.

### 📖 Esperienza di Lettura Immersiva
*   **Modalità Distraction-Free**: Estrazione automatica del contenuto tramite *Mozilla Readability* per una lettura pulita e coerente.
*   **Ricerca & Organizzazione**: Motore di ricerca integrato per trovare rapidamente articoli tra tutti i tuoi feed e gestione semplificata delle sottoscrizioni.
*   **Prefetching Intelligente**: Gli articoli vengono caricati preventivamente in background per garantirti un'apertura istantanea, anche offline.
*   **Immagini Senza Compromessi**: Visualizzazione ottimizzata delle immagini a tutta altezza (senza ritagli) sia nell'anteprima che nell'articolo completo.

### 🎨 Personalizzazione Estrema
*   **OLED Ready**: Include il tema **Pure Black** per il massimo risparmio energetico su schermi AMOLED.
*   **Tipografia Variabile**: Supporto per font Sans-serif (Inter) con dimensioni regolabili da *Small* a *X-Large*.
*   **Gesti Intuitivi**: Azioni swipe personalizzabili per segnare come letto o aggiungere ai preferiti con un solo tocco.

### 🚀 Tecnologia & Performance
*   **Offline First**: Tutti i feed e gli articoli sono salvati localmente tramite *IndexedDB*.
*   **Android Native**: Icone e splash screen personalizzati per un'esperienza app nativa fluida grazie a *Capacitor*.

---

## 🛠️ Stack Tecnologico

*   **Frontend**: React 19 + TypeScript
*   **Styling**: Tailwind CSS 4.0 (Modern Utility-First)
*   **Animazioni**: Framer Motion (Transizioni fluide e feedback aptico visivo)
*   **Storage**: idb-keyval (IndexedDB)
*   **Native Bridge**: Capacitor (Accesso alle API native Android/iOS)
*   **Content Engine**: @mozilla/readability

---

## 📱 Installazione & Sviluppo

### Requisiti
*   Node.js (v18+)
*   npm

### Setup Locale
```bash
# Installa le dipendenze
npm install

# Avvia il server di sviluppo
npm run dev
```

### Build Android
```bash
# Genera la build di produzione
npm run build

# Sincronizza con il progetto Android
npx cap sync android
```

---

## 🛡️ Privacy & Sicurezza
Flusso non traccia le tue abitudini di lettura. Tutti i dati dei tuoi feed rimangono sul tuo dispositivo. Le immagini vengono caricate con `referrerPolicy="no-referrer"` per proteggere la tua identità durante la navigazione.

---
*Sviluppato con ❤️ per una lettura migliore.*
