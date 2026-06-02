import { RadioStation } from '../types';

export interface ScheduleItem {
  id: string;
  time: string;
  title: string;
  description: string;
  host: string;
  startHour: number;
  endHour: number;
}

// Simple deterministic hash to get consistent state based on stationuuid and date
const getDeterministicHash = (str: string, seedOffset: number = 0): number => {
  let hash = 17 + seedOffset;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
};

// Returns a value from an array deterministically
const pickFrom = <T>(arr: T[], seedStr: string, offset: number = 0): T => {
  const hash = getDeterministicHash(seedStr, offset);
  return arr[hash % arr.length];
};

export const getRadioSchedule = (station: RadioStation, targetDate: Date = new Date()): {
  schedule: ScheduleItem[];
  currentProgram: ScheduleItem;
} => {
  const name = station.name || '';
  const tags = (station.tags || '').toLowerCase();
  
  // Create a unique key for this station + day
  const dateStr = `${targetDate.getFullYear()}-${targetDate.getMonth()}-${targetDate.getDate()}`;
  const seed = `${station.stationuuid}-${dateStr}`;
  
  // List of potential hosts
  const popHosts1 = ['Marco Rossi', 'Gabriele e Chiara', 'Alessandro B.', 'Federica N.', 'Sara & Leo', 'Mattia Silvestri'];
  const popHosts2 = ['Giulia Bianchi', 'Luca & Francesca', 'Stefano S.', 'Martina G.', 'Roby DJ', 'Andrea Conti'];
  const rockHosts = ['Doctor Rock', 'Massimo "Max" Cerri', 'Jimmy the Voice', 'Edoardo Rocker', 'Valentina Rock', 'Roxy & Paul'];
  const jazzHosts = ['Gianluca Russo', 'Paolo Jazzman', 'Elena Melodia', 'Claudio Blue', 'Sofia Sax', 'Walter Swing'];
  const classicalHosts = ['Prof. Roberto Alberti', 'Maestro Luca Vitali', 'Beatrice Valsecchi', 'Stefano Vivaldi', 'Grazia Chopin', 'Andrea Bach'];
  const newsHosts = ['Daniele Giannetti', 'Marianna Giornalisti', 'Franco Attualità', 'Sandro Notizie', 'Chiara Report', 'Laura Press'];

  let genre: 'classical' | 'rock' | 'jazz' | 'news' | 'sport' | 'pop' = 'pop';

  if (tags.includes('classical') || name.toLowerCase().includes('classica') || name.toLowerCase().includes('symphon') || name.toLowerCase().includes('opera')) {
    genre = 'classical';
  } else if (tags.includes('rock') || name.toLowerCase().includes('rock') || tags.includes('metal')) {
    genre = 'rock';
  } else if (tags.includes('jazz') || name.toLowerCase().includes('jazz') || tags.includes('blues') || name.toLowerCase().includes('swing')) {
    genre = 'jazz';
  } else if (tags.includes('news') || tags.includes('talk') || tags.includes('talk-show') || name.toLowerCase().includes('news') || tags.includes('informazione')) {
    genre = 'news';
  } else if (tags.includes('sport') || name.toLowerCase().includes('sport') || name.toLowerCase().includes('calcio')) {
    genre = 'sport';
  }

  const hosts = genre === 'classical' ? classicalHosts
              : genre === 'rock' ? rockHosts
              : genre === 'jazz' ? jazzHosts
              : genre === 'news' ? newsHosts
              : genre === 'sport' ? newsHosts // reuse news hosts for sport
              : pickFrom([popHosts1, popHosts2], seed, 1);

  const createItem = (id: string, startHour: number, endHour: number, title: string, description: string, hostIdx: number): ScheduleItem => {
    const startStr = startHour.toString().padStart(2, '0') + ':00';
    const endStr = endHour.toString().padStart(2, '0') + ':00';
    const host = pickFrom(hosts, seed, hostIdx);
    
    return {
      id,
      time: `${startStr} - ${endStr}`,
      title,
      description,
      host,
      startHour,
      endHour
    };
  };

  let items: ScheduleItem[] = [];

  if (genre === 'classical') {
    items = [
      createItem('c1', 6, 9, 'Armonie del Mattino', 'Suoni dolci, sinfonie rilassanti e arie barocche per iniziare al meglio la giornata.', 0),
      createItem('c2', 9, 13, 'La Grande Orchestra', 'Le più celebri sinfonie ed esecuzioni orchestrali dai migliori teatri del mondo.', 1),
      createItem('c3', 13, 15, "Pomeriggio all'Opera", 'Una raffinata guida all\'ascolto delle più spettacolari arie d\'opera del panorama italiano ed europeo.', 2),
      createItem('c4', 15, 19, 'Preludio e Fuga', 'Un viaggio interiore nella musica da camera, sonate per pianoforte e capolavori di Bach, Mozart e Beethoven.', 3),
      createItem('c5', 19, 22, 'Concerto della Sera', 'Registrazioni esclusive dal vivo, concerti solisti e rarità musicali commentate dai nostri maestri ospiti.', 4),
      createItem('c6', 22, 6, 'Notturno Classico', 'Melodie vellutate, adagi e composizioni strumentali sognanti per accompagnare le ore più quiete della notte.', 5),
    ];
  } else if (genre === 'rock') {
    items = [
      createItem('r1', 6, 9, 'Morning Glory Rock', 'La miglior carica energica con i grandi classici: Pink Floyd, Led Zeppelin, Queen e AC/DC.', 0),
      createItem('r2', 9, 13, 'Rock Zone', 'Novità alternative rock, grunge degli anni \x2790 e grandi successi indie rock del momento.', 1),
      createItem('r3', 13, 15, 'Masters of Rock', 'Monografie dedicate ai giganti della musica rock. Aneddoti, rarità e brani indimenticabili.', 2),
      createItem('r4', 15, 19, 'Heavy Rotation', 'Le hit rock più trasmesse, metal classico e hard rock pesante per scuotere il pomeriggio.', 3),
      createItem('r5', 19, 22, 'Live & Loud', 'L\x27atmosfera magica dei concerti live più leggendari della storia con interviste esclusive ai protagonisti.', 4),
      createItem('r6', 22, 6, 'Rock And Roll Over', 'Rock sotterraneo, sonorità oscure e riff intensi per tutti gli instancabili nottambuli del rock.', 5),
    ];
  } else if (genre === 'jazz') {
    items = [
      createItem('j1', 6, 9, 'Smooth Morning', 'Il calore dello smooth jazz e del lounge per un risveglio morbido, elegante e rilassato.', 0),
      createItem('j2', 9, 13, 'Swing & Bebop Sessions', 'I grandi maestri: Miles Davis, John Coltrane, Ella Fitzgerald e fiumi di swing travolgente.', 1),
      createItem('j3', 13, 15, 'Blue Note Legends', 'Approfondimenti esclusivi sugli artisti leggendari dell\x27iconica etichetta discografica Blue Note.', 2),
      createItem('j4', 15, 19, 'Modern Jazz & Fusion', 'Dove il jazz incontra il funk e l\x27elettronica. Le nuove sperimentazioni contemporanee.', 3),
      createItem('j5', 19, 22, 'Jazz Club Live', 'Suoni dal vivo direttamente dai migliori jazz club italiani ed europei con performance da brivido.', 4),
      createItem('j6', 22, 6, 'Midnight Jazz Lounge', 'Raffinato jazz notturno, ballate intime e selezioni di pianoforte solista per sognare.', 5),
    ];
  } else if (genre === 'news') {
    items = [
      createItem('n1', 6, 9, 'Prima Pagina & Rassegna Stampa', 'Le notizie di apertura, meteo, viabilità e rassegna stampa di tutti i quotidiani nazionali ed esteri.', 0),
      createItem('n2', 9, 12, 'Focus Economia & Società', 'I principali fatti di economia, finanza e politica spiegati in modo semplice con esperti in studio.', 1),
      createItem('n3', 12, 14, 'Filo Diretto Attualità', 'Spazio aperto alle opinioni degli ascoltatori, che intervengono telefonicamente sui temi caldi della giornata.', 2),
      createItem('n4', 14, 18, 'Il Mondo Oggi', 'Inchieste giornalistiche, corrispondenze dall\x27estero e speciali su cultura, tecnologia ed ecologia.', 3),
      createItem('n5', 18, 20, 'Notiziario della Sera', 'Il bilancio completo dei fatti del giorno con interviste esclusive e dettagliati focus di approfondimento.', 4),
      createItem('n6', 20, 6, 'Voci nella Notte', 'Letture d’autore, repliche dei programmi di maggior successo ed elegante sottofondo musicale.', 5),
    ];
  } else if (genre === 'sport') {
    items = [
      createItem('s1', 6, 9, 'Riscaldamento Mattutino', 'Rassegna stampa sportiva, tutte le prime pagine dei quotidiani sportivi e aggiornamenti flash dalle redazioni.', 0),
      createItem('s2', 9, 13, 'Dribbling Calciomercato', 'Il salotto dello sport: trattative di mercato in tempo reale, interviste calde e retroscena imperdibili.', 1),
      createItem('s3', 13, 15, 'A Tutto Campo', 'Approfondimenti sul campionato nazionale, dinamiche tattiche e analisi post-partita con ex calciatori.', 2),
      createItem('s4', 15, 19, 'Terzo Tempo Multisport', 'Dal basket ai motori (F1, MotoGP), dal ciclismo al tennis. Tutti i risultati dagli altri campi.', 3),
      createItem('s5', 19, 21, 'Pressing Loft', 'Dibattiti infuocati e opinioni taglienti tra editorialisti e opinionisti di fama nazionale.', 4),
      createItem('s6', 21, 6, 'Overtime Live', 'Interazione social con gli appassionati, statistiche, curiosità e storie di leggende dello sport del passato.', 5),
    ];
  } else {
    // Default Pop / Dance / Hits
    items = [
      createItem('p1', 6, 10, 'Power Breakfast Show', 'La sveglia più allegra e frizzante dell\x27etere! Gag esilaranti, oroscopo, meteo e tantissime hit.', 0),
      createItem('p2', 10, 13, 'Music Connection', 'Le 100% grandi hit del momento trasmesse senza interruzioni pubblicitarie. Solo la migliore musica.', 1),
      createItem('p3', 13, 15, 'Top Hits Chart', 'La classifica ufficiale dei singoli più amati, più votati dagli ascoltatori e più cercati sul web.', 2),
      createItem('p4', 15, 18, 'Pomeriggio in Diretta', 'I vostri messaggi WhatsApp, canzoni dedicate, gossip sugli artisti e curiosità dal mondo social.', 3),
      createItem('p5', 18, 21, 'Sunset Club', 'L\x27aperitivo perfetto a ritmo di house, dance e club music di ieri e di oggi per scaldare la serata.', 4),
      createItem('p6', 21, 0, 'Party Tour & DJ Set', 'I migliori deejay internazionali si alternano alla consolle per un party scatenato direttamente a casa tua.', 5),
      createItem('p7', 0, 6, 'Late Night Vibes', 'Musica pop e dance non-stop per gli amanti della notte e del lavoro notturno.', 11),
    ];
  }

  // Find current program based on targetDate hour
  const currentHour = targetDate.getHours();
  let currentProgram = items[0];

  for (const item of items) {
    if (item.startHour < item.endHour) {
      if (currentHour >= item.startHour && currentHour < item.endHour) {
        currentProgram = item;
        break;
      }
    } else {
      // Overnight programs (e.g. 22 to 6, or 21 to 0, or 0 to 6)
      if (currentHour >= item.startHour || currentHour < item.endHour) {
        currentProgram = item;
        break;
      }
    }
  }

  return {
    schedule: items,
    currentProgram
  };
};
