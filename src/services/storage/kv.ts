import { db } from '../db';

export const kvStorage = {
  async get(key: string): Promise<any> {
    const item = await db.kv.get(key);
    return item ? item.value : null;
  },
  async set(key: string, value: any): Promise<void> {
    await db.kv.put({ id: key, value });
  }
};
