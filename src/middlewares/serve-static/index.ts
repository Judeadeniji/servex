import type * as fsPromisesType from "fs/promises";
import type * as nodePathType from "path";
import type { Context } from "../../context";
import type { StorageAdapter } from "../../storage/types";
import type { NextFunction } from "../../types";
export interface ServeStaticOptions {
	/**
	 * Root directory to serve files from. Defaults to "./public" if no storage adapter is provided.
	 */
	root?: string;
	/**
	 * Default file to serve if a directory is requested. Defaults to "index.html"
	 */
	index?: string;
	/**
	 * Optional storage adapter to serve files from instead of the local file system.
	 * Useful for edge environments (Cloudflare Workers, Deno Deploy) where node:fs is unavailable.
	 */
	storage?: StorageAdapter;
}

const MIME_TYPES: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".js": "application/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".svg": "image/svg+xml",
	".ico": "image/x-icon",
	".webp": "image/webp",
	".txt": "text/plain; charset=utf-8",
	".pdf": "application/pdf",
	".xml": "application/xml",
	".zip": "application/zip",
	".wasm": "application/wasm",
	".mp4": "video/mp4",
	".mp3": "audio/mpeg",
};

/**
 * Middleware to serve static files from the file system.
 * Uses dynamic imports for Node built-ins so it won't crash in edge environments
 * unless executed.
 */
export const serveStatic = (options: ServeStaticOptions = {}) => {
	const rootDir = options.root ?? "./public";
	const indexFile = options.index ?? "index.html";

	let fs: typeof fsPromisesType;
	let path: typeof nodePathType;
	let initialized = false;

	return async (c: Context, next: NextFunction) => {
		// Only handle GET and HEAD requests
		if (c.req.method !== "GET" && c.req.method !== "HEAD") {
			return next();
		}

		const url = new URL(c.req.url);
		const pathname = decodeURIComponent(url.pathname);

		if (options.storage) {
			let key = pathname.startsWith("/") ? pathname.slice(1) : pathname;
			if (!key) key = indexFile;

			let data = await options.storage.get(key);
			let finalKey = key;

			// If not found, try index fallback
			if (!data) {
				let indexKey = key.endsWith("/")
					? key + indexFile
					: `${key}/${indexFile}`;
				// Strip trailing/leading slashes just in case
				if (indexKey.startsWith("/")) indexKey = indexKey.slice(1);

				data = await options.storage.get(indexKey);
				if (data) finalKey = indexKey;
			}

			if (!data) return next();

			const lastDot = finalKey.lastIndexOf(".");
			const lastSlash = finalKey.lastIndexOf("/");
			let ext = "";
			if (lastDot !== -1 && lastDot > lastSlash) {
				ext = finalKey.slice(lastDot).toLowerCase();
			}

			const contentType = MIME_TYPES[ext] || "application/octet-stream";
			c.setHeaders({
				"Content-Type": contentType,
				"Content-Length": data.byteLength.toString(),
			});

			return new Response(data as BodyInit, {
				status: 200,
				headers: c.header(),
			});
		}

		try {
			if (!initialized) {
				fs = await import("fs/promises");
				path = await import("path");
				initialized = true;
			}
		} catch (_e) {
			console.warn(
				"serveStatic: node:fs and node:path are required for this middleware.",
			);
			return next();
		}

		// Prevent directory traversal
		if (pathname.includes("..")) {
			return c.text("Forbidden", 403);
		}

		const absoluteRoot = path.resolve(rootDir);
		let requestedPath = path.join(absoluteRoot, pathname);

		try {
			let stat = await fs.stat(requestedPath);

			// If it's a directory, append index file
			if (stat.isDirectory()) {
				requestedPath = path.join(requestedPath, indexFile);
				stat = await fs.stat(requestedPath);
			}

			// Final security check: ensure resolved path is within root
			if (!requestedPath.startsWith(absoluteRoot)) {
				return c.text("Forbidden", 403);
			}

			// Read file content
			const fileBuffer = await fs.readFile(requestedPath);
			const ext = path.extname(requestedPath).toLowerCase();
			const contentType = MIME_TYPES[ext] || "application/octet-stream";

			c.setHeaders({
				"Content-Type": contentType,
				"Content-Length": stat.size.toString(),
			});

			return new Response(fileBuffer as BodyInit, {
				status: 200,
				headers: c.header(),
			});
		} catch (error: unknown) {
			// File not found, let the next middleware/handler run
			const err = error as { code?: string };
			if (err.code === "ENOENT" || err.code === "ENOTDIR") {
				return next();
			}

			// Re-throw unexpected errors
			throw error;
		}
	};
};
