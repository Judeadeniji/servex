import { route } from "../src/router";
import { createServer } from "../src";

const app = createServer({
  routes: [
    route("GET /", (c) => c.text("Hello World")),
    route("GET /stream", (c) => {
      const readableStream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode("First chunk\n"));
          await new Promise((resolve) => setTimeout(resolve, 3000)); // Simulate delay
          controller.enqueue(encoder.encode("Second chunk\n"));
          await new Promise((resolve) => setTimeout(resolve, 3000)); // Simulate delay
          controller.enqueue(encoder.encode("Third chunk\n"));
          await new Promise((resolve) => setTimeout(resolve, 3000)); // Simulate delay

          controller.close();
        }
      });

      return c.stream(readableStream);
    }),
  ],
});

export default {
  fetch: app.fetch,
};
