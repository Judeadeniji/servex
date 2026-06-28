import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { FileSystemStorage } from "../src/storage/fs";
import { MemoryStorage } from "../src/storage/memory";

describe("Storage: MemoryStorage", () => {
	let storage: MemoryStorage;

	beforeEach(() => {
		storage = new MemoryStorage();
	});

	it("should set and get a string value", async () => {
		await storage.set("key1", "hello world");
		expect(await storage.getString("key1")).toBe("hello world");
	});

	it("should return null for non-existent keys", async () => {
		expect(await storage.get("missing")).toBeNull();
		expect(await storage.getString("missing")).toBeNull();
	});

	it("should set and get Uint8Array values", async () => {
		const data = new Uint8Array([1, 2, 3, 4, 5]);
		await storage.set("key2", data);

		const result = await storage.get("key2");
		expect(result).toEqual(data);
		expect(result).not.toBe(data); // should be a copy
	});

	it("should delete keys", async () => {
		await storage.set("key1", "test");
		expect(await storage.has("key1")).toBeTrue();

		const deleted = await storage.delete("key1");
		expect(deleted).toBeTrue();
		expect(await storage.has("key1")).toBeFalse();
		expect(await storage.delete("key1")).toBeFalse();
	});

	it("should list keys with prefix filtering", async () => {
		await storage.set("user:1", "alice");
		await storage.set("user:2", "bob");
		await storage.set("session:abc", "data");

		const allKeys = await storage.keys();
		expect(allKeys.length).toBe(3);
		expect(allKeys).toContain("user:1");

		const userKeys = await storage.keys("user:");
		expect(userKeys.length).toBe(2);
		expect(userKeys).toContain("user:1");
		expect(userKeys).not.toContain("session:abc");
	});

	it("should clear all keys", async () => {
		await storage.set("a", "1");
		await storage.set("b", "2");

		await storage.clear();
		expect(await storage.keys()).toEqual([]);
		expect(await storage.has("a")).toBeFalse();
	});
});

describe("Storage: FileSystemStorage", () => {
	const tempDir = path.join(os.tmpdir(), "servex-storage-test");
	let storage: FileSystemStorage;

	beforeEach(async () => {
		storage = new FileSystemStorage(tempDir);
		await storage.clear();
	});

	afterAll(async () => {
		await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
	});

	it("should set and get a string value", async () => {
		await storage.set("key1", "hello world from fs");
		expect(await storage.getString("key1")).toBe("hello world from fs");
	});

	it("should set and get Uint8Array values", async () => {
		const data = new Uint8Array([10, 20, 30, 40]);
		await storage.set("key2", data);

		const result = await storage.get("key2");
		expect(result).toEqual(data);
	});

	it("should delete keys and remove files", async () => {
		await storage.set("key1", "test");
		expect(await storage.has("key1")).toBeTrue();

		const deleted = await storage.delete("key1");
		expect(deleted).toBeTrue();
		expect(await storage.has("key1")).toBeFalse();
	});

	it("should list keys with prefix filtering", async () => {
		await storage.set("user:1", "alice");
		await storage.set("user:2", "bob");
		await storage.set("session:abc", "data");

		const userKeys = await storage.keys("user:");
		expect(userKeys.length).toBe(2);
		expect(userKeys).toContain("user:1");
		expect(userKeys).not.toContain("session:abc");
	});

	it("should persist data across instances", async () => {
		await storage.set("persistent_key", "still here");

		// Create a new instance pointing to the same directory
		const newStorage = new FileSystemStorage(tempDir);
		expect(await newStorage.getString("persistent_key")).toBe("still here");
		expect(await newStorage.keys()).toContain("persistent_key");
	});
});
