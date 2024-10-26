import { createServer } from "../src";
import { type ServeXInterface } from "../src/types";
import { devTools } from "../src/plugins/dev-tools";
import { dotenv } from "../src/plugins/dotenv";

interface E extends ServeXInterface.Env {
  Globals: {
    date: Date;
  };
  Variables: {
    KEY: number;
  };
}

const app = createServer<E>({
  // plugins: [devTools(), dotenv()],
});

app.get("/hi/:name", async (ctx) => {
  return ctx.json({ date: ctx.globals("date"), key: ctx.env().KEY, name: ctx.params("name"),  hi: "there"  });
});

app.request("http://localhost:3000/hi").then(v => v.text()).then(console.log)

export default {
  fetch: app.fetch,
};
