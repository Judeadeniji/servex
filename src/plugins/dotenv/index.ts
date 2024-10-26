import Dotenv, { type DotenvOptions } from "../../dotenv";
import packageJson from "../../../package.json";
import type { Env, Plugin, PluginContext } from "../../types";

interface E2 extends Env {
  Globals: {
    env: string | Record<string, string>
  }
}

function dotenv<E extends Env>(options?: DotenvOptions) {

  return {
    name: `dotenv@${packageJson.version}`,
    onInit(pluginContext: PluginContext<E2>) {
      const { parsed, error } = Dotenv.config(options);

      if (error) throw error

      pluginContext.events$.onRequest((rc) => {
        rc.globals.set("env", parsed)
      })
    },
  } as unknown as Plugin<E>
}

export { dotenv, type DotenvOptions };
