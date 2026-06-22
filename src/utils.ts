export async function waitUntil(promise: Promise<unknown>) {
	await Promise.resolve(promise);
}
