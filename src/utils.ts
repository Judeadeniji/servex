export async function waitUntil(promise: Promise<any>) {
  (await Promise.resolve(promise));
}