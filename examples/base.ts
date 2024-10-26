import { createServer } from "../src";
import { Context, type ServeX } from "../src/types";
import { devTools } from "../src/plugins/dev-tools";
import { dotenv } from "../src/plugins/dotenv";
import Router from "../src/router/lib";

interface E extends ServeX.Env {
  Globals: {
    date: Date;
  };
  Variables: {
    KEY: number;
  };
}

const r = new Router();

r.get("/hi/:name", (c) => c.text(`hi, ${c.params("name")}`));
r.get("/hi/", (c) => c.text("Hi"));
// r.get("/hi/:name/*hu", (c) => c.text("Hi"));


(async () => {
  const res = r.handle(
    new Request("http://localhost:3000/hi/ServeX"),
    function () {
  
      console.log("done");
    }
  );
  console.log(await (await res)?.text())
})()

const app = createServer<E>({
  plugins: [devTools(), dotenv()],
});

export default {
  fetch: app.fetch,
};
