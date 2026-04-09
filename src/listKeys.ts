import { entries } from 'idb-keyval';

async function listKeys() {
  const allEntries = await entries();
  console.log('All keys in idb-keyval:', allEntries.map(e => e[0]));
}

listKeys();
