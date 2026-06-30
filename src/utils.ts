import type { HTMLBundlelike } from "./types";

export async function waitUntil(promise: Promise<unknown>) {
	await Promise.resolve(promise);
}

export const SUPPORTED_METHODS = [
	"get",
	"post",
	"put",
	"delete",
	"patch",
	"options",
	"head",
] as const;

export const isHTMLBundle = (val: any): val is HTMLBundlelike =>
	!!val &&
	(val.toString() === "[object HTMLBundle]" ||
		val.constructor?.name === "HTMLBundle");
