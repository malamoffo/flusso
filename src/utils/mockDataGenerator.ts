import { db } from '../services/db';
import { isNative } from './platform';
import { Feed, Article, Subreddit, RedditPost, FullArticleContent } from '../types';

const createSvg = (w: number, h: number, bg: string, content: string) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" height="100%">
    <rect width="${w}" height="${h}" fill="${bg}"/>
    ${content}
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

const quantumImg = createSvg(
  800, 450, '#0B0F19',
  `<defs>
    <linearGradient id="qg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3B82F6"/>
      <stop offset="50%" stop-color="#8B5CF6"/>
      <stop offset="100%" stop-color="#06B6D4"/>
    </linearGradient>
    <radialGradient id="qglow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#6366F1" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="#0B0F19" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="800" height="450" fill="url(#qglow)"/>
  <circle cx="400" cy="225" r="120" fill="none" stroke="url(#qg)" stroke-width="2" stroke-dasharray="6,6" opacity="0.6"/>
  <circle cx="400" cy="225" r="70" fill="none" stroke="#60A5FA" stroke-width="3"/>
  <ellipse cx="400" cy="225" rx="140" ry="50" fill="none" stroke="#A855F7" stroke-width="2" transform="rotate(30 400 225)"/>
  <ellipse cx="400" cy="225" rx="140" ry="50" fill="none" stroke="#06B6D4" stroke-width="2" transform="rotate(-30 400 225)"/>
  <circle cx="400" cy="225" r="18" fill="#F8FAFC"/>
  <circle cx="400" cy="225" r="30" fill="#38BDF8" opacity="0.4"/>
  <text x="400" y="380" font-family="system-ui, sans-serif" font-size="20" font-weight="600" fill="#E2E8F0" text-anchor="middle" letter-spacing="2">QUANTUM COMPUTING LAB</text>`
);

const photosynthesisImg = createSvg(
  800, 450, '#062419',
  `<defs>
    <linearGradient id="pg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#10B981"/>
      <stop offset="50%" stop-color="#059669"/>
      <stop offset="100%" stop-color="#34D399"/>
    </linearGradient>
  </defs>
  <path d="M 300 280 C 300 160 400 120 500 120 C 500 240 400 280 300 280 Z" fill="url(#pg)" opacity="0.85"/>
  <path d="M 300 280 Q 400 200 500 120" stroke="#ECFDF5" stroke-width="3" fill="none"/>
  <circle cx="360" cy="200" r="8" fill="#FDE047" opacity="0.9"/>
  <circle cx="440" cy="180" r="10" fill="#67E8F9" opacity="0.9"/>
  <circle cx="410" cy="240" r="6" fill="#FDE047" opacity="0.8"/>
  <text x="400" y="370" font-family="system-ui, sans-serif" font-size="20" font-weight="600" fill="#D1FAE5" text-anchor="middle" letter-spacing="2">ARTIFICIAL PHOTOSYNTHESIS</text>`
);

const pizzaImg = createSvg(
  800, 450, '#1C130E',
  `<defs>
    <radialGradient id="pizzaglow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#D97706" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#1C130E" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="800" height="450" fill="url(#pizzaglow)"/>
  <circle cx="400" cy="210" r="130" fill="#D97706" stroke="#92400E" stroke-width="8"/>
  <circle cx="400" cy="210" r="110" fill="#DC2626"/>
  <circle cx="370" cy="180" r="28" fill="#FEF3C7"/>
  <circle cx="440" cy="220" r="32" fill="#FEF3C7"/>
  <circle cx="380" cy="240" r="22" fill="#FEF3C7"/>
  <circle cx="430" cy="170" r="20" fill="#FEF3C7"/>
  <path d="M 400 195 C 410 185 425 190 420 205 C 415 220 400 210 400 195 Z" fill="#16A34A"/>
  <path d="M 360 210 C 370 200 380 208 375 218 C 370 228 360 220 360 210 Z" fill="#16A34A"/>
  <text x="400" y="380" font-family="system-ui, sans-serif" font-size="20" font-weight="600" fill="#FED7AA" text-anchor="middle" letter-spacing="2">CHIMICA DELLA PIZZA NAPOLETANA</text>`
);

const telescopeImg = createSvg(
  800, 450, '#030712',
  `<defs>
    <radialGradient id="spacebg" cx="50%" cy="50%" r="60%">
      <stop offset="0%" stop-color="#4C1D95" stop-opacity="0.5"/>
      <stop offset="50%" stop-color="#1E1B4B" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#030712" stop-opacity="1"/>
    </radialGradient>
  </defs>
  <rect width="800" height="450" fill="url(#spacebg)"/>
  <circle cx="200" cy="100" r="1.5" fill="#FFFFFF"/>
  <circle cx="650" cy="120" r="2" fill="#FFFFFF"/>
  <circle cx="150" cy="300" r="2" fill="#FDE047"/>
  <circle cx="680" cy="320" r="1.5" fill="#FFFFFF"/>
  <polygon points="400,140 440,165 440,215 400,240 360,215 360,165" fill="#F59E0B" stroke="#B45309" stroke-width="2"/>
  <polygon points="445,165 485,190 485,240 445,265 405,240 405,190" fill="#FBBF24" stroke="#B45309" stroke-width="2"/>
  <polygon points="355,165 395,190 395,240 355,265 315,240 315,190" fill="#FBBF24" stroke="#B45309" stroke-width="2"/>
  <text x="400" y="375" font-family="system-ui, sans-serif" font-size="20" font-weight="600" fill="#E0E7FF" text-anchor="middle" letter-spacing="2">DEEP SPACE OBSERVATORY</text>`
);

const cyberpunkTowerImg = createSvg(
  540, 960, '#090514',
  `<defs>
    <linearGradient id="towerg" x1="0%" y1="100%" x2="0%" y2="0%">
      <stop offset="0%" stop-color="#3B0764"/>
      <stop offset="60%" stop-color="#06B6D4"/>
      <stop offset="100%" stop-color="#EC4899"/>
    </linearGradient>
  </defs>
  <rect width="540" height="960" fill="#090514"/>
  <polygon points="200,960 230,220 310,220 340,960" fill="url(#towerg)" opacity="0.8"/>
  <line x1="270" y1="220" x2="270" y2="90" stroke="#EC4899" stroke-width="4"/>
  <circle cx="270" cy="80" r="10" fill="#F43F5E"/>
  <line x1="215" y1="350" x2="325" y2="350" stroke="#22D3EE" stroke-width="3"/>
  <line x1="210" y1="500" x2="330" y2="500" stroke="#22D3EE" stroke-width="3"/>
  <line x1="205" y1="650" x2="335" y2="650" stroke="#22D3EE" stroke-width="3"/>
  <line x1="200" y1="800" x2="340" y2="800" stroke="#22D3EE" stroke-width="3"/>
  <text x="270" y="900" font-family="system-ui, sans-serif" font-size="18" font-weight="700" fill="#F472B6" text-anchor="middle" letter-spacing="3">MEGASTRUCTURE 9:16</text>`
);

const retroBotImg = createSvg(
  600, 600, '#1E232A',
  `<defs>
    <radialGradient id="crtglow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#22C55E" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#052E16" stop-opacity="1"/>
    </radialGradient>
  </defs>
  <rect x="100" y="80" width="400" height="340" rx="24" fill="#E2E8F0" stroke="#94A3B8" stroke-width="8"/>
  <rect x="135" y="115" width="330" height="270" rx="16" fill="url(#crtglow)" stroke="#15803D" stroke-width="4"/>
  <text x="160" y="180" font-family="monospace" font-size="20" fill="#4ADE80">&gt; BOOTING OS v1.1...</text>
  <text x="160" y="220" font-family="monospace" font-size="18" fill="#86EFAC">&gt; MEMORY: 640KB OK</text>
  <text x="160" y="260" font-family="monospace" font-size="18" fill="#4ADE80">&gt; RETRO COMPUTING</text>
  <rect x="100" y="445" width="400" height="90" rx="12" fill="#CBD5E1"/>
  <text x="300" y="580" font-family="system-ui, sans-serif" font-size="18" font-weight="600" fill="#94A3B8" text-anchor="middle">CRT TERMINAL 1:1</text>`
);

const macroMineralImg = createSvg(
  600, 800, '#020617',
  `<defs>
    <linearGradient id="crystalg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#A855F7"/>
      <stop offset="50%" stop-color="#3B82F6"/>
      <stop offset="100%" stop-color="#06B6D4"/>
    </linearGradient>
  </defs>
  <polygon points="300,120 440,320 300,560 160,320" fill="url(#crystalg)" opacity="0.85"/>
  <polygon points="300,120 370,320 300,560" fill="#C084FC" opacity="0.6"/>
  <polygon points="300,560 480,480 300,680 120,480" fill="url(#crystalg)" opacity="0.7"/>
  <text x="300" y="740" font-family="system-ui, sans-serif" font-size="18" font-weight="600" fill="#C4B5FD" text-anchor="middle" letter-spacing="2">BIOLUMINESCENT MINERAL 3:4</text>`
);

const synthwaveSunsetImg = createSvg(
  800, 450, '#110726',
  `<defs>
    <linearGradient id="sung" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FBBF24"/>
      <stop offset="100%" stop-color="#EC4899"/>
    </linearGradient>
  </defs>
  <circle cx="400" cy="220" r="100" fill="url(#sung)"/>
  <rect x="280" y="170" width="240" height="6" fill="#110726"/>
  <rect x="290" y="190" width="220" height="8" fill="#110726"/>
  <rect x="305" y="215" width="190" height="10" fill="#110726"/>
  <polygon points="0,270 800,270 800,450 0,450" fill="#180B38"/>
  <line x1="0" y1="270" x2="800" y2="270" stroke="#06B6D4" stroke-width="2"/>
  <line x1="400" y1="270" x2="400" y2="450" stroke="#EC4899" stroke-width="2"/>
  <line x1="400" y1="270" x2="150" y2="450" stroke="#EC4899" stroke-width="2"/>
  <line x1="400" y1="270" x2="650" y2="450" stroke="#EC4899" stroke-width="2"/>
  <line x1="400" y1="270" x2="-100" y2="450" stroke="#EC4899" stroke-width="1.5"/>
  <line x1="400" y1="270" x2="900" y2="450" stroke="#EC4899" stroke-width="1.5"/>
  <line x1="0" y1="310" x2="800" y2="310" stroke="#06B6D4" stroke-width="1.5"/>
  <line x1="0" y1="360" x2="800" y2="360" stroke="#06B6D4" stroke-width="2"/>
  <line x1="0" y1="420" x2="800" y2="420" stroke="#06B6D4" stroke-width="2.5"/>`
);

export async function generateMockDataIfNeeded() {
  // Solo quando non siamo in ambiente nativo (es. sul device)
  if (isNative()) {
    return;
  }

  try {
    // 1. Pulizia attiva di eventuali vecchi elementi di test con tag [TEST] o [MOCK] o placeholder
    try {
      const allArticles = await db.articles.toArray();
      const unwantedArticles = allArticles.filter(a => 
        (a.title && (a.title.includes('[TEST]') || a.title.includes('[MOCK]') || a.title.toLowerCase().includes('placeholder'))) ||
        (a.content && a.content.includes('[TEST]'))
      );
      for (const a of unwantedArticles) {
        await db.articles.delete(a.id);
        await db.articleContents.delete(a.id);
      }

      const allPosts = await db.redditPosts.toArray();
      const unwantedPosts = allPosts.filter(p => 
        (p.title && (p.title.includes('[TEST]') || p.title.includes('[MOCK]') || p.title.toLowerCase().includes('placeholder'))) ||
        (p.id && (p.id.startsWith('mock/') || p.id.includes('mock-post')))
      );
      for (const p of unwantedPosts) {
        await db.redditPosts.delete(p.id);
      }
    } catch (cleanErr) {
      console.warn('[MOCK] Pulizia vecchi placeholder non riuscita:', cleanErr);
    }

    const feedCount = await db.feeds.count();
    const subCount = await db.subreddits.count();

    const mockFeeds: Feed[] = [
      {
        id: 'mock-feed-tecno',
        title: 'Flusso Tecno & Scienza',
        feedUrl: 'https://example.com/mock-feed-tecno',
        link: 'https://example.com/mock-feed-tecno',
        description: 'Notizie sul futuro della tecnologia, scienza ed esplorazione spaziale.',
        type: 'article',
        lastRefreshStatus: 'success',
        lastFetched: Date.now(),
      },
      {
        id: 'mock-feed-stili',
        title: 'Flusso Vita & Cultura',
        feedUrl: 'https://example.com/mock-feed-stili',
        link: 'https://example.com/mock-feed-stili',
        description: 'Spunti di riflessione, scienza della cucina e tendenze culturali.',
        type: 'article',
        lastRefreshStatus: 'success',
        lastFetched: Date.now(),
      }
    ];

    const mockArticles: Article[] = [
      {
        id: 'mock-art-1',
        feedId: 'mock-feed-tecno',
        title: "L'alba dell'era quantistica: come i computer quantistici rivoluzioneranno la crittografia",
        link: 'https://example.com/mock-art-1',
        pubDate: Date.now() - 3600000, // 1h fa
        imageUrl: quantumImg,
        contentSnippet: "I computer quantistici non sono più un'ipotesi fantascientifica. Con la recente stabilità dei qubit superconduttori, la crittografia odierna rischia di essere superata. Ma quali sono le reali implicazioni?",
        content: `I computer quantistici rappresentano il prossimo balzo evolutivo nel calcolo computazionale. Sfruttando le leggi della meccanica quantistica, in particolare la sovrapposizione e l'entanglement (correlazione quantistica), queste macchine possono processare una quantità di informazioni inconcepibile per qualsiasi supercomputer tradizionale.

Mentre un computer classico elabora bit che possono essere solo 0 o 1, un qubit quantistico può esistere in uno stato di sovrapposizione, assumendo contemporaneamente entrambi i valori. Questo permette di eseguire calcoli in parallelo su scala enorme.

La minaccia più grande riguarda la crittografia a chiave pubblica RSA, utilizzata per proteggere le comunicazioni bancarie, i dati governativi e le password di tutto il mondo. L'algoritmo di Shor, un algoritmo quantistico teorizzato nel 1994, è in grado di fattorizzare numeri interi in fattori primi in tempo polinomiale. Questo significa che una chiave RSA che richiederebbe miliardi di anni per essere decifrata da un computer classico potrebbe essere violata in pochi minuti o secondi da un computer quantistico sufficientemente potente.

Tuttavia, la ricerca non è ferma: scienziati e crittografi di tutto il mondo stanno sviluppando la cosiddetta "crittografia post-quantistica" (PQC), basata su complessi problemi matematici (como la crittografia basata su reticoli) che si ritiene siano resistenti anche agli attacchi dei computer quantistici. Il futuro della sicurezza digitale dipenderà da quanto velocemente riusciremo a migrare verso questi nuovi standard prima dell'avvento dei computer quantistici su larga scala.`,
        isRead: 0,
        isFavorite: 0,
        type: 'article',
      },
      {
        id: 'mock-art-2',
        feedId: 'mock-feed-tecno',
        title: "La fotosintesi artificiale: catturare l'energia solare come fanno le piante",
        link: 'https://example.com/mock-art-2',
        pubDate: Date.now() - 7200000, // 2h fa
        imageUrl: photosynthesisImg,
        contentSnippet: "Ricercatori europei hanno sviluppato un nuovo catalizzatore molecolare capace di imitare il processo biologico della fotosintesi, aprendo la strada alla produzione pulita di idrogeno e combustibili solari.",
        content: `La fotosintesi artificiale è una tecnologia pulita d'avanguardia che mira a imitare il processo naturale con cui le piante convertono la luce solare, l'acqua e l'anidride carbonica in carboidrati ed ossigeno. L'obiettivo degli scienziati è produrre "combustibili solari", come l'idrogeno verde e il metanolo, direttamente dalla luce del sole, senza passare per la rete elettrica o l'uso di combustibili fossili.

Il cuore del processo risiede nella scissione dell'acqua (water splitting). Utilizzando la luce solare come fonte energetica e speciali materiali catalizzatori, la molecola d'acqua (H2O) viene scomposta in idrogeno (H2) e ossigeno (O2). L'idrogeno così ottenuto può essere immagazzinato, trasportato ed utilizzato in celle a combustibile per generare elettricità con come unico scarto l'acqua pura.

Un team di ricercatori europei ha recentemente pubblicato uno studio su Nature Chemistry in cui descrive un innovativo catalizzatore a base di cobalto e carbonio. Questo catalizzatore riduce drasticamente l'energia richiesta per attivare la reazione di scissione e possiede una stabilità mai vista prima, operando ininterrottamente per oltre 500 ore senza degradarsi.

Se integrata su scala industriale, la fotosintesi artificiale potrebbe non solo fornire una fonte inesauribile di idrogeno verde, ma anche contribuire attivamente alla riduzione della CO2 atmosferica. Infatti, catturando l'anidride carbonica industriale e combinandola con l'idrogeno solare, si possono produrre carburanti sintetici a impatto zero per l'aviazione e il trasporto marittimo pesante, settori dove l'elettrificazione a batterie è attualmente impraticabile.`,
        isRead: 0,
        isFavorite: 0,
        type: 'article',
      },
      {
        id: 'mock-art-3',
        feedId: 'mock-feed-stili',
        title: "L'arte dell'impasto: la scienza chimica dietro la pizza napoletana perfetta",
        link: 'https://example.com/mock-art-3',
        pubDate: Date.now() - 10800000, // 3h fa
        imageUrl: pizzaImg,
        contentSnippet: "La pizza perfetta non è solo questione di passione, ma anche di termodinamica e biochimica. Dalla maturazione delle proteine del glutine all'azione dei lieviti, ecco la spiegazione scientifica.",
        content: `La preparazione della pizza napoletana è considerata un'arte tradizionale, protetta anche dall'UNESCO, ma dal punto di vista scientifico si tratta di un affascinante esperimento di biochimica e termodinamica. Ogni fase, dall'idratazione della farina fino alla cottura rapida nel forno a legna, è regolata da precise leggi scientifiche.

Tutto ha inizio con la farina e l'acqua. Quando l'acqua viene aggiunta alla farina di grano tenero, due proteine principali – la gliadina e la glutenina – iniziano a legarsi tra loro formando un complesso reticolo proteico chiamato glutine. Il glutine conferisce elasticità e tenacità all'impasto, creando una struttura "a palloncino" capace di trattenere i gas prodotti dalla fermentazione.

La fermentazione è l'opera del lievito (solitamente Saccharomyces cerevisiae). Il lievito metabolizza gli zuccheri semplici presenti nella farina, producendo anidride carbonica (CO2) ed etanolo. La maturazione dell'impasto, che avviene idealmente a temperature controllate tra i 4°C e i 20°C per un periodo che va dalle 24 alle 48 ore, permette agli enzimi (amilasi e proteasi) di scomporre gli amidi complessi in zuccheri più semplici e le catene proteiche del glutine in amminoacidi. Questo processo rende l'impasto molto più digeribile, leggero ed aromatico.

Infine, la cottura. La vera pizza napoletana deve cuocere a temperature comprese tra i 430°C e i 485°C per appena 60-90 secondi. A questa temperatura estrema, l'acqua all'interno dell'impasto evapora quasi istantaneamente, espandendo le sacche di gas e creando il caratteristico "cornicione" alveolato. Contemporaneamente, si innesca la reazione di Maillard: gli amminoacidi e gli zuccheri riduttori sulla superficie della pizza reagiscono chimicamente sotto l'effetto del calore intenso, producendo centinaia di nuovi composti aromatici che conferiscono alla pizza il suo inconfondibile profumo, la colorazione ambrata e le tipiche macchie scure soprannominate "a macchia di leopardo".`,
        isRead: 0,
        isFavorite: 0,
        type: 'article',
      },
      {
        id: 'mock-art-4',
        feedId: 'mock-feed-stili',
        title: "Esplorazione del cosmo: le nuove frontiere dell'astrofotografia profonda",
        link: 'https://example.com/mock-art-4',
        pubDate: Date.now() - 86400000, // 1 giorno fa
        imageUrl: telescopeImg,
        contentSnippet: "I moderni sensori e i telescopi spaziali permettono di osservare la nascita delle prime stelle dell'universo. Una guida alle meraviglie visive dell'astronomia moderna.",
        content: `Negli ultimi anni, l'astrofisica e l'osservazione dello spazio profondo hanno compiuto passi da gigante grazie all'integrazione di sensori iperspettrali a bassissimo rumore termico e specchi primari segmentati in berillio e oro.

Le spettacolari immagini delle nebulose stellari, delle galassie a spirale e degli ammassi di materia non sono soltanto capolavori visivi che ispirano meraviglia, ma contengono mappe quantitative di densità molecolare, idrogeno ionizzato e polveri interstellari.

Attraverso tecniche avanzate di de-rumorizzazione e stacking matematico, gli astronomi possono ricostruire la luce emessa oltre 13 miliardi di anni fa, viaggiando a ritroso nel tempo verso le prime generazioni di stelle formatesi subito dopo il Big Bang.`,
        isRead: 0,
        isFavorite: 0,
        type: 'article',
      }
    ];

    if (feedCount === 0) {
      console.log('[MOCK] Inserimento feed e articoli di prova con contenuti e immagini...');
      await db.feeds.bulkPut(mockFeeds);
      await db.articles.bulkPut(mockArticles);

      for (const art of mockArticles) {
        const fullContent: FullArticleContent = {
          title: art.title,
          content: art.content || '',
          textContent: art.contentSnippet || '',
          length: art.content?.length || 0,
          excerpt: art.contentSnippet || '',
          byline: 'Redazione Flusso',
          dir: 'ltr',
          siteName: 'Flusso Magazine',
          lang: 'it',
          isScraped: true
        };
        await db.articleContents.put({ id: art.id, ...fullContent });
      }
    } else {
      // Aggiorna sempre gli articoli mock esistenti con contenuti e immagini
      for (const art of mockArticles) {
        const existing = await db.articles.get(art.id);
        if (existing) {
          await db.articles.update(art.id, {
            imageUrl: art.imageUrl,
            content: art.content,
            contentSnippet: art.contentSnippet
          });
        }
      }
    }

    const mockSubreddits: Subreddit[] = [
      {
        id: 'mock-sub-1',
        name: 'tecnologia',
        addedAt: Date.now(),
      },
      {
        id: 'mock-sub-2',
        name: 'scienza',
        addedAt: Date.now(),
      },
      {
        id: 'mock-sub-3',
        name: 'design',
        addedAt: Date.now(),
      },
      {
        id: 'mock-sub-4',
        name: 'futurismo',
        addedAt: Date.now(),
      }
    ];

    const mockRedditPosts: RedditPost[] = [
      {
        id: 'mock-post-1',
        subredditId: 'mock-sub-4',
        subredditName: 'futurismo',
        title: "Progetto Megastruttura Cyberpunk: ecco il render della torre a impatto climatico zero (Formato Verticale 9:16)",
        author: 'u/neo_architect',
        url: 'https://reddit.com/r/futurismo/comments/mock1',
        permalink: '/r/futurismo/comments/mock1',
        imageUrl: cyberpunkTowerImg,
        score: 1420,
        numComments: 215,
        createdUtc: Math.floor((Date.now() - 1800000) / 1000), // 30min fa
        selftextHtml: `<p>Condivido con la community questo studio architettonico per una torre residenziale ad altissima densità e biosostenibilità verticale.</p>
<p>L'edificio integra giardini pensili eolicamente schermati, facciate a celle solari organiche traslucide e un sistema di raccolta e purificazione ciclica dell'acqua piovana lungo l'intera altezza.</p>
<p>Cosa ne pensate dell'impatto visivo e dell'integrazione con il tessuto urbano metropolitano?</p>`,
        isRead: 0,
        isFavorite: 0,
      },
      {
        id: 'mock-post-2',
        subredditId: 'mock-sub-3',
        subredditName: 'design',
        title: "Ho restaurato e riprogrammato questo micro-computer vintage con schermo CRT ai fosfori verdi (Formato Quadrato 1:1)",
        author: 'u/retro_maker',
        url: 'https://reddit.com/r/design/comments/mock2',
        permalink: '/r/design/comments/mock2',
        imageUrl: retroBotImg,
        score: 980,
        numComments: 87,
        createdUtc: Math.floor((Date.now() - 5400000) / 1000), // 1.5h fa
        selftextHtml: `<p>Dopo 3 mesi di lavoro di recupero componenti originali anni '80 e cablaggio con un microcontroller moderno, ecco il risultato!</p>
<p>Lo chassis è stato sabbiato e riverniciato con finitura opaca beige vintage. La tastiera meccanica utilizza switch lineari originali e lo schermo a fosfori verdi è incredibilmente rilassante per la lettura.</p>`,
        isRead: 0,
        isFavorite: 0,
      },
      {
        id: 'mock-post-3',
        subredditId: 'mock-sub-2',
        subredditName: 'scienza',
        title: "Macro-fotografia di cristalli bioluminescenti di fluorite e azzurrite naturale (Formato 3:4)",
        author: 'u/mineral_geo',
        url: 'https://reddit.com/r/scienza/comments/mock3',
        permalink: '/r/scienza/comments/mock3',
        imageUrl: macroMineralImg,
        score: 1250,
        numComments: 104,
        createdUtc: Math.floor((Date.now() - 10800000) / 1000), // 3h fa
        selftextHtml: `<p>Scatto effettuato con ottica macro 100mm a 2.5x di ingrandimento sotto illuminazione UV ad onde corte.</p>
<p>La fluorescenza naturale è dovuta alla presenza di tracce di ioni di terre rare (europio e terbio) intrappolati nel reticolo cristallino durante la genesi idrotermale primordiale.</p>`,
        isRead: 0,
        isFavorite: 0,
      },
      {
        id: 'mock-post-4',
        subredditId: 'mock-sub-1',
        subredditName: 'tecnologia',
        title: "Paesaggio digitale Synthwave renderizzato in tempo reale su GPU a 240 FPS (Formato Panoramico 16:9)",
        author: 'u/synth_shader',
        url: 'https://reddit.com/r/tecnologia/comments/mock4',
        permalink: '/r/tecnologia/comments/mock4',
        imageUrl: synthwaveSunsetImg,
        score: 670,
        numComments: 58,
        createdUtc: Math.floor((Date.now() - 14400000) / 1000), // 4h fa
        selftextHtml: `<p>Esperimento con compute shaders personalizzati in WebGPU per generare il terreno infinito e l'atmosfera retro-futuristica con ray marching volumetrico in tempo reale.</p>
<p>Il consumo di memoria video è inferiore a 120MB grazie alla generazione procedurale delle geometrie.</p>`,
        isRead: 0,
        isFavorite: 0,
      },
      {
        id: 'mock-post-5',
        subredditId: 'mock-sub-2',
        subredditName: 'scienza',
        title: "Lanciato con successo il nuovo telescopio orbitale per lo studio dell'energia oscura",
        author: 'u/astro_lore',
        url: 'https://reddit.com/r/scienza/comments/mock5',
        permalink: '/r/scienza/comments/mock5',
        imageUrl: telescopeImg,
        score: 821,
        numComments: 144,
        createdUtc: Math.floor((Date.now() - 21600000) / 1000), // 6h fa
        selftextHtml: `<p>Oggi è una giornata storica per l'astrofisica. L'agenzia spaziale ha confermato il perfetto posizionamento in orbita del telescopio "Eclissi", progettato appositamente per mappare la distribuzione della materia oscura e svelare i segreti dell'energia oscura.</p>
<p>L'energia oscura costituisce circa il 68% dell'universo conosciuto ed è la responsabile dell'espansione accelerata dello spazio, ma la sua natura intima rimane uno dei misteri più grandi della fisica moderna.</p>`,
        isRead: 0,
        isFavorite: 0,
      }
    ];

    if (subCount === 0) {
      console.log('[MOCK] Inserimento subreddit e post di prova...');
      await db.subreddits.bulkPut(mockSubreddits);
      await db.redditPosts.bulkPut(mockRedditPosts);
    } else {
      // Aggiorna sempre i post con contenuti e immagini ad altezze diverse
      await db.subreddits.bulkPut(mockSubreddits);
      await db.redditPosts.bulkPut(mockRedditPosts);
    }
  } catch (error) {
    console.error('[MOCK] Errore durante la generazione dei dati mock:', error);
  }
}


