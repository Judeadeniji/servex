export * from "./types";
export * from "./memory";
export * from "./fs";

import { MemoryStorage } from "./memory";

/**
 * Creates a default ephemeral storage adapter (MemoryStorage).
 * Useful for serverless platforms where disk access is unavailable or wiped.
 */
export function createStorage() {
  return new MemoryStorage();
}
