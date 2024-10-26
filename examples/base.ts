import { route } from "../src/router";
import { createServer } from "../src";
import type { ServeX } from "../src/types";
import { devTools } from "../src/plugins/dev-tools";
import { dotenv } from "../src/plugins/dotenv";

interface E extends ServeX.Env {
  Globals: {
    date: Date;
  };
  Variables: {
    KEY: number
  }
}

const app = createServer<E>({
  routes: [
    route("GET /", (c) =>
      c.text(`Hello from ServeX!\n`)
    ),
    route("GET /env", (c) => c.json({ KEY: c.env().KEY })),
  ],

  plugins: [devTools(), dotenv({
    debug: true,
    encoding: "binary",
    DOTENV_KEY: "dotenv://:key_1234@dotenvx.com/vault/.env.vault?environment=production"
  })],
});

export default {
  fetch: app.fetch,
};
