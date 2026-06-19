import type { StorageAdapter } from "./types";

/**
 * A persistent file-system storage adapter for Node/Bun/Deno.
 * Uses a flat directory structure where keys are hashed (to avoid path traversal
 * and invalid character issues). A metadata file maps keys to file names.
 * Not suitable for Cloudflare Workers.
 */
export class FileSystemStorage implements StorageAdapter {
  private baseDir: string;
  // A simple metadata file to keep track of the original keys
  private metaFile!: string;
  private keyMap: Map<string, string> = new Map();
  private initialized = false;

  // Dynamically loaded node modules
  private fs!: typeof import("node:fs/promises");
  private path!: typeof import("node:path");
  private crypto!: typeof import("node:crypto");

  constructor(baseDir: string) {
    this.baseDir = baseDir; // Resolved dynamically during init
  }

  private async init() {
    if (this.initialized) return;

    try {
      this.fs = await import("node:fs/promises");
      this.path = await import("node:path");
      this.crypto = await import("node:crypto");
    } catch (e) {
      throw new Error("FileSystemStorage requires Node.js built-ins (fs, path, crypto) which are unavailable in this environment.");
    }

    this.baseDir = this.path.resolve(this.baseDir);
    this.metaFile = this.path.join(this.baseDir, ".meta.json");
    
    try {
      await this.fs.mkdir(this.baseDir, { recursive: true });
    } catch (e) {
      // Ignore if exists
    }

    try {
      const metaContent = await this.fs.readFile(this.metaFile, "utf-8");
      const parsed = JSON.parse(metaContent);
      for (const [k, v] of Object.entries(parsed)) {
        this.keyMap.set(k, v as string);
      }
    } catch (e) {
      // Meta file doesn't exist yet or is corrupted, start fresh
      this.keyMap = new Map();
    }
    
    this.initialized = true;
  }

  private async saveMeta() {
    const obj = Object.fromEntries(this.keyMap);
    await this.fs.writeFile(this.metaFile, JSON.stringify(obj, null, 2), "utf-8");
  }

  private getFilePath(key: string): string {
    let filename = this.keyMap.get(key);
    if (!filename) {
      // Create a safe, unique filename using a hash of the key
      filename = this.crypto.createHash("sha256").update(key).digest("hex") + ".bin";
      this.keyMap.set(key, filename);
    }
    return this.path.join(this.baseDir, filename);
  }

  async get(key: string): Promise<Uint8Array | null> {
    await this.init();
    if (!this.keyMap.has(key)) return null;
    
    try {
      const buf = await this.fs.readFile(this.getFilePath(key));
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    } catch (e) {
      return null;
    }
  }

  async getString(key: string): Promise<string | null> {
    await this.init();
    if (!this.keyMap.has(key)) return null;
    
    try {
      return await this.fs.readFile(this.getFilePath(key), "utf-8");
    } catch (e) {
      return null;
    }
  }

  async set(key: string, value: Uint8Array | string): Promise<void> {
    await this.init();
    const filePath = this.getFilePath(key);
    
    // Write the actual file
    await this.fs.writeFile(filePath, value);
    // Persist metadata
    await this.saveMeta();
  }

  async delete(key: string): Promise<boolean> {
    await this.init();
    if (!this.keyMap.has(key)) return false;
    
    const filePath = this.getFilePath(key);
    this.keyMap.delete(key);
    
    try {
      await this.fs.unlink(filePath);
      await this.saveMeta();
      return true;
    } catch (e) {
      // Clean up map even if unlink fails
      await this.saveMeta();
      return false;
    }
  }

  async has(key: string): Promise<boolean> {
    await this.init();
    return this.keyMap.has(key);
  }

  async keys(prefix?: string): Promise<string[]> {
    await this.init();
    const allKeys = Array.from(this.keyMap.keys());
    if (prefix) {
      return allKeys.filter(k => k.startsWith(prefix));
    }
    return allKeys;
  }

  async clear(): Promise<void> {
    await this.init();
    for (const filename of this.keyMap.values()) {
      try {
        await this.fs.unlink(this.path.join(this.baseDir, filename));
      } catch (e) {
        // Ignore errors during clear
      }
    }
    this.keyMap.clear();
    await this.saveMeta();
  }
}
