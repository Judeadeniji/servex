/**
 * Represents a generic storage adapter that can be used for ephemeral in-memory
 * storage or persistent disk storage.
 */
export interface StorageAdapter {
	/** Retrieves a value as a raw byte array. Returns null if the key does not exist. */
	get(key: string): Promise<Uint8Array | null>;

	/** Retrieves a value as a UTF-8 string. Returns null if the key does not exist. */
	getString(key: string): Promise<string | null>;

	/** Sets a value for a given key. The value can be a string or byte array. */
	set(key: string, value: Uint8Array | string): Promise<void>;

	/** Deletes a key from the storage. Returns true if the key existed and was deleted. */
	delete(key: string): Promise<boolean>;

	/** Checks if a key exists in the storage. */
	has(key: string): Promise<boolean>;

	/** Lists all keys in the storage. Optionally filters by a prefix. */
	keys(prefix?: string): Promise<string[]>;

	/** Clears all keys in the storage. */
	clear(): Promise<void>;
}
