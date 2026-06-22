export * from "./fs";
export * from "./memory";
export * from "./types";

import { MemoryStorage } from "./memory";

/**
 * Creates a default ephemeral storage adapter (MemoryStorage).
 * Useful for serverless platforms where disk access is unavailable or wiped.
 */
export function createStorage() {
	return new MemoryStorage();
}
