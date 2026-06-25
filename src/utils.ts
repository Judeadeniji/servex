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
