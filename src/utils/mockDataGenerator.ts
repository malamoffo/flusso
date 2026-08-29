import { db } from '../services/db';
import { isNative } from './platform';
import { Feed, Article, Subreddit, RedditPost, FullArticleContent } from '../types';

import quantumImg from '../assets/images/quantum_computing_1788011278912.jpg';
import photosynthesisImg from '../assets/images/art_photosynthesis_1788011292569.jpg';
import pizzaImg from '../assets/images/neapolitan_pizza_1788011305762.jpg';
import telescopeImg from '../assets/images/space_telescope_1788011317596.jpg';
import cyberpunkTowerImg from '../assets/images/reddit_cyberpunk_tower_1788011698879.jpg';
import retroBotImg from '../assets/images/reddit_retro_bot_1788011713932.jpg';
import macroMineralImg from '../assets/images/reddit_macro_mineral_1788011728262.jpg';
import synthwaveSunsetImg from '../assets/images/reddit_synthwave_sunset_1788011742811.jpg';

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


