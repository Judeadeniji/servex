import type { StorageAdapter } from "./types";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * An in-memory ephemeral storage adapter.
 * Data is lost when the application restarts. Ideal for serverless environments
 * like Cloudflare Workers where the local filesystem isn't available.
 */
export class MemoryStorage implements StorageAdapter {
  private store = new Map<string, Uint8Array>();

  async get(key: string): Promise<Uint8Array | null> {
    const value = this.store.get(key);
    if (!value) return null;
    // Return a copy to prevent accidental mutation of the stored value
    return new Uint8Array(value);
  }

  async getString(key: string): Promise<string | null> {
    const value = this.store.get(key);
    if (!value) return null;
    return decoder.decode(value);
  }

  async set(key: string, value: Uint8Array | string): Promise<void> {
    if (typeof value === "string") {
      this.store.set(key, encoder.encode(value));
    } else {
      // Store a copy of the Uint8Array
      this.store.set(key, new Uint8Array(value));
    }
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async has(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  async keys(prefix?: string): Promise<string[]> {
    const allKeys = Array.from(this.store.keys());
    if (prefix) {
      return allKeys.filter(k => k.startsWith(prefix));
    }
    return allKeys;
  }

  async clear(): Promise<void> {
    this.store.clear();
  }
}
