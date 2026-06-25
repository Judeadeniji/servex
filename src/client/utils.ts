import type { RequestOptions } from "./index";

export function buildClientUrl(
	baseUrl: string,
	pathSegments: string[],
	options: RequestOptions = {},
): URL {
	let finalPath = `/${pathSegments.join("/")}`;
	if (options.params) {
		for (const key in options.params) {
			finalPath = finalPath.replace(
				`:${key}`,
				encodeURIComponent(String(options.params[key])),
			);
		}
	}

	if (options.query) {
		let queryStr = "";
		let isFirst = true;
		for (const key in options.query) {
			const value = options.query[key];
			if (value === undefined) continue;

			const encodedKey = encodeURIComponent(key);
			if (Array.isArray(value)) {
				for (let i = 0; i < value.length; i++) {
					queryStr +=
						(isFirst ? "?" : "&") +
						encodedKey +
						"=" +
						encodeURIComponent(String(value[i]));
					isFirst = false;
				}
			} else {
				queryStr +=
					(isFirst ? "?" : "&") +
					encodedKey +
					"=" +
					encodeURIComponent(String(value));
				isFirst = false;
			}
		}
		finalPath += queryStr;
	}

	return new URL(finalPath, baseUrl);
}

export function buildRequestInit(
	method: string,
	options: RequestOptions = {},
): RequestInit {
	const init: RequestInit = {
		method: method.toUpperCase(),
		headers: {
			"Content-Type": "application/json",
			...(options.headers || {}),
		},
	};

	if (options.body !== undefined) {
		init.body = JSON.stringify(options.body);
	}

	return init;
}

export async function parseClientResponse(res: Response): Promise<unknown> {
	if (!res.ok) {
		throw new Error(
			`ServeX RPC Error: HTTP ${res.status} ${res.statusText}`.trim(),
		);
	}

	const contentType = res.headers.get("content-type") || "";
	if (contentType.includes("application/json")) {
		return res.json();
	}
	return res.text();
}
