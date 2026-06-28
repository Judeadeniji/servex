import { createServer } from "../src";

const app = createServer()
	.get("/stream", (c) => {
		const readableStream = new ReadableStream({
			async start(controller) {
				const encoder = new TextEncoder();
				controller.enqueue(encoder.encode("First chunk\n"));
				await Bun.sleep(1000);
				controller.enqueue(encoder.encode("Second chunk\n"));
				controller.close();
			}
		});
		return c.stream(readableStream);
	});

export default { fetch: app.fetch };
