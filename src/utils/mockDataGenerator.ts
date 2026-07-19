import { db } from '../services/db';
import { isNative } from './platform';
import { Feed, Article, Subreddit, RedditPost, FullArticleContent } from '../types';

export async function generateMockDataIfNeeded() {
  // Solo quando non siamo in ambiente nativo (es. sul device)
  if (isNative()) {
    return;
  }

  try {
    // Controlliamo se ci sono già feed nel database
    const feedCount = await db.feeds.count();
    const subCount = await db.subreddits.count();

    if (feedCount === 0) {
      console.log('[MOCK] Generazione feed e articoli di prova per lo sviluppo...');

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
          title: "AI e creatività: i modelli generativi possono davvero creare arte originale?",
          link: 'https://example.com/mock-art-4',
          pubDate: Date.now() - 86400000, // 1 giorno fa
          contentSnippet: "I modelli generativi creano immagini e testi sorprendenti, ma si tratta di vera espressione artistica o solo di sofisticata statistica probabilistica? Un'analisi filosofica e tecnica.",
          content: `Negli ultimi anni, l'avvento dei modelli generativi di intelligenza artificiale, come Midjourney, DALL-E e i modelli di linguaggio della famiglia Gemini e GPT, ha scosso profondamente il mondo dell'arte, della scrittura e del design. L'abilità di queste macchine nel generare dipinti iperrealistici, poesie commoventi o interi saggi accademici in pochi secondi ha riacceso un antico dibattito filosofico: l'AI è davvero creativa?

Dal punto di vista prettamente tecnico, i modelli generativi non "creano" nel senso umano del termine. Essi si basano su reti neurali artificiali addestrate su set di dati monumentali composti da miliardi di immagini e testi creati dall'uomo. Durante questa fase di addestramento, il modello impara a mappare le complesse relazioni probabilistiche tra le parole o le caratteristiche visive. Quando viene inserito un prompt, l'AI non fa altro che predire la combinazione di pixel o parole che meglio si adatta alla richiesta basandosi sulla statistica computazionale. È una forma ultra-sofisticata di sintesi e interpolazione di dati preesistenti.

Sul piano filosofico ed estetico, invece, le opinioni sono divise. Molti sostengono che l'arte richieda intenzionalità, coscienza e un'esperienza di vita vissuta. L'AI non prova emozioni, non ha un vissuto personale, né ha l'intento cosciente di comunicare un messaggio o un disagio esistenziale. È uno specchio vuoto che riflette l'ingegno collettivo dell'umanità da cui è stata addestrata.

Tuttavia, altri artisti vedono l'AI come un nuovo, straordinario strumento creativo, analogo all'invenzione della fotografia nel XIX secolo. Proprio come la macchina fotografica non ha ucciso la pittura ma l'ha liberata dall'obbligo del realismo dando vita all'impressionismo, così l'AI generativa potrebbe liberare l'uomo dalle mansioni esecutive più ripetitive, spostando il focus dell'atto creativo sulla pura ideazione concettuale, sulla curatela artistica e sulla raffinazione dei prompt. In questo scenario, la vera creatività rimane saldamente nelle mani dell'essere umano che guida la macchina.`,
          isRead: 0,
          isFavorite: 0,
          type: 'article',
        }
      ];

      // Scriviamo i dati nel database
      await db.feeds.bulkPut(mockFeeds);
      await db.articles.bulkPut(mockArticles);

      // Scriviamo anche i contenuti completi di questi articoli per il lettore immediato
      for (const art of mockArticles) {
        const fullContent: FullArticleContent = {
          title: art.title,
          content: art.content || '',
          textContent: art.contentSnippet || '',
          length: art.content?.length || 0,
          excerpt: art.contentSnippet || '',
          byline: 'Autore Flusso',
          dir: 'ltr',
          siteName: 'Flusso Blog',
          lang: 'it',
          isScraped: true
        };
        await db.articleContents.put({ id: art.id, ...fullContent });
      }

      console.log('[MOCK] Generazione feed e articoli completata.');
    }

    if (subCount === 0) {
      console.log('[MOCK] Generazione subreddit e post Reddit di prova per lo sviluppo...');

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
        }
      ];

      const mockRedditPosts: RedditPost[] = [
        {
          id: 'mock-post-1',
          subredditId: 'mock-sub-1',
          subredditName: 'tecnologia',
          title: "Discussione: Quali saranno i lavori del futuro influenzati maggiormente dall'Intelligenza Artificiale?",
          author: 'u/futuro_tech',
          url: 'https://reddit.com/r/tecnologia/comments/mock1',
          permalink: '/r/tecnologia/comments/mock1',
          score: 342,
          numComments: 89,
          createdUtc: Math.floor((Date.now() - 3600000) / 1000), // 1h fa
          selftextHtml: `<p>Ciao a tutti! Negli ultimi mesi stiamo assistendo ad un'accelerazione pazzesca dei modelli linguistici e degli agenti autonomi.</p>
<p>Secondo voi, quali settori lavorativi saranno i primi ad essere trasformati radicalmente nei prossimi 5 anni? Molti dicono il servizio clienti e la scrittura di codice entry-level, ma io penso che anche l'analisi finanziaria e la pianificazione logistica subiranno una rivoluzione totale.</p>
<p>Qual è la vostra esperienza diretta nelle vostre rispettive aziende? Avete già visto l'integrazione di questi tool nei flussi di lavoro quotidiani?</p>`,
          isRead: 0,
          isFavorite: 0,
        },
        {
          id: 'mock-post-2',
          subredditId: 'mock-sub-2',
          subredditName: 'scienza',
          title: "Lanciato con successo il nuovo telescopio orbitale per lo studio dell'energia oscura",
          author: 'u/astro_lore',
          url: 'https://reddit.com/r/scienza/comments/mock2',
          permalink: '/r/scienza/comments/mock2',
          score: 821,
          numComments: 144,
          createdUtc: Math.floor((Date.now() - 14400000) / 1000), // 4h fa
          selftextHtml: `<p>Oggi è una giornata storica per l'astrofisica. L'agenzia spaziale ha confermato il perfetto posizionamento in orbita del telescopio "Eclissi", progettato appositamente per mappare la distribuzione della materia oscura e svelare i segreti dell'energia oscura.</p>
<p>L'energia oscura costituisce circa il 68% dell'universo conosciuto ed è la responsabile dell'espansione accelerata dello spazio, ma la sua natura intima rimane uno dei misteri più grandi della fisica moderna.</p>
<p>Il telescopio inizierà a inviare i primi dati scientifici e immagini ad alta risoluzione tra circa sei mesi, dopo aver completato la calibrazione degli specchi e della sensibilissima camera a infrarossi.</p>`,
          isRead: 0,
          isFavorite: 0,
        }
      ];

      await db.subreddits.bulkPut(mockSubreddits);
      await db.redditPosts.bulkPut(mockRedditPosts);
      console.log('[MOCK] Generazione subreddit e post completata.');
    }
  } catch (error) {
    console.error('[MOCK] Errore durante la generazione dei dati mock:', error);
  }
}
