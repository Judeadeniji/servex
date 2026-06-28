import { createServer } from "../src";

const app = createServer()
	.trace(async ({ onHandle, onRequest }) => {
		onRequest(({ begin, onStop }) => {
			onStop(({ end }) => {
				console.log(`[Trace] Request parsing took ${end - begin}ms`);
			});
		});

		onHandle(({ begin, onStop }) => {
			onStop(({ end, error }) => {
				if (error) {
					console.log(`[Trace] Handle crashed after ${end - begin}ms: ${error.message}`);
				} else {
					console.log(`[Trace] Handle executed in ${end - begin}ms`);
				}
			});
		});
	})
	.get("/", (c) => c.text("Trace API demo"));

export default { fetch: app.fetch };
