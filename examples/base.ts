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
    tsConfigPath: `${process.cwd()}/tsconfig.json`
  });
  

  return {
    name: "fs-plugin",
     async onInit(pluginContext) {
      await fr.initialize();
      
      fr.getRoutes().forEach(route => {
        console.log(route)
        pluginContext.server[route.method.toLowerCase() as HTTPMethod](route.path, route.handler as Handler<E>)
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

app.get("/hi/:name", async (ctx) => {
  return ctx.json({ date: ctx.globals("date"), key: ctx.env().KEY, name: ctx.params("name"),  hi: "there"  });
});

// app.request("http://localhost:3000/hi").then(v => v.text()).then(console.log)

export default {
  fetch: app.fetch,
};
