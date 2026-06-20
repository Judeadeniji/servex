import { createServer } from "../../src";

const app = createServer({ basePath: "api" });

app.trace(async ({ onHandle }) => {
  onHandle(({ begin, onStop }) => {
    onStop(({ end, error }) => {
      console.log(`Route execution took ${end - begin}ms`);
      if (error) console.error("Failed with:", error);
    });
  });
});

app.get("/", (c) => c.text("Hello World"));



export default {
  port: 3001,
  fetch: app.fetch
};
