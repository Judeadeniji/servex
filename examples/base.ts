import { createServer } from "../src";
import { type Handler, type HTTPMethod, type Plugin, type ServeXInterface } from "../src/types";
import { devTools } from "../src/plugins/dev-tools";
import { dotenv } from "../src/plugins/dotenv";
import { FsRouter } from "../src/router/fs-router/fs-router";

function fsPlugin(): Plugin<E> {
  const fr = new FsRouter({
    routesDir: `${__dirname}/routes`,
    generateTypes: true,
    dev: true,
  });
  

  return {
    name: "fs-plugin",
     async onInit(pluginContext) {
      await fr.initialize();
      
      fr.getRoutes().forEach(route => {
        pluginContext.server[route.method.toLowerCase() as HTTPMethod](route.path, ...(route.middlewares || [])as Handler<E>[], route.handler as Handler<E>)
      })
    },
  }
}
 
interface E extends ServeXInterface.Env {
  Globals: {
    date: Date;
  };
  Variables: {
    KEY: number;
  };
}

const app = createServer<E>({
  plugins: [devTools(), dotenv(), fsPlugin()],
});

app.get("/hi/:name", async (ctx, next) => {
  console.log("Middleware 1")
  await next()
}, async (ctx) => {
  return ctx.text(`Hi, ${ctx.params("name")}\n`);
});

// app.request("http://localhost:3000/hi").then(v => v.text()).then(console.log)

export default {
  fetch: app.fetch,
};
