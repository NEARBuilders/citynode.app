import { LocalStorage } from "@hot-labs/near-connect";

export function prefixedStorage(prefix: string): LocalStorage {
  const inner = new LocalStorage();
  return {
    async get(key: string): Promise<string | null> {
      return inner.get(`${prefix}${key}`);
    },
    async set(key: string, value: string): Promise<void> {
      await inner.set(`${prefix}${key}`, value);
    },
    async remove(key: string): Promise<void> {
      await inner.remove(`${prefix}${key}`);
    },
  };
}
