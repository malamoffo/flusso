import { storage } from './services/storage';

async function testFetch() {
    try {
        const data = await storage.fetchFeedData('https://gameromancer.com/feed/podcast', 0);
        console.log('Feed data:', JSON.stringify(data?.feed, null, 2));
    } catch (e) {
        console.error(e);
    }
}

testFetch();
