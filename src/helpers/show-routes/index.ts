import type { ServeXRouter, ServerRoute } from "../../types";

export interface ShowRoutesOptions {
  /** 
   * If true, output is returned as a string rather than logged to the console.
   * @default false
   */
  returnString?: boolean;
}

/**
 * A user-facing helper to print all registered routes in a clear, formatted table.
 * 
 * @param app The ServeX app or router instance.
 * @param options Optional configuration.
 */
export function showRoutes(app: ServeXRouter<any, any, any>, options: ShowRoutesOptions = {}): string | void {
  const routes = app.routes;
  if (!routes || routes.length === 0) {
    const msg = "No routes registered.";
    if (options.returnString) return msg;
    console.log(msg);
    return;
  }

  // Sort routes purely by path, then method
  const sortedRoutes = [...routes].sort((a, b) => {
    if (a.path !== b.path) return a.path.localeCompare(b.path);
    return a.method.localeCompare(b.method);
  });

  // Calculate max widths for nice alignment
  const maxMethodLen = Math.max(...sortedRoutes.map(r => r.method.length), "METHOD".length);
  const maxPathLen = Math.max(...sortedRoutes.map(r => r.path.length), "PATH".length);

  let output = `\nRegistered Routes:\n`;
  output += `\x1b[90m${"-".repeat(maxMethodLen + maxPathLen + 4)}\x1b[0m\n`;
  
  for (const route of sortedRoutes) {
    let methodColor = "\x1b[32m"; // GET green
    if (route.method === "POST") methodColor = "\x1b[33m"; // yellow
    else if (route.method === "PUT" || route.method === "PATCH") methodColor = "\x1b[34m"; // blue
    else if (route.method === "DELETE") methodColor = "\x1b[31m"; // red
    else if (route.method === "OPTIONS" || route.method === "HEAD") methodColor = "\x1b[35m"; // magenta
    
    // Reset color
    const reset = "\x1b[0m";
    
    const paddedMethod = route.method.padEnd(maxMethodLen);
    output += `${methodColor}${paddedMethod}${reset}  ${route.path}\n`;
  }
  
  output += `\x1b[90m${"-".repeat(maxMethodLen + maxPathLen + 4)}\x1b[0m\n`;

  if (options.returnString) {
    return output;
  }
  
  // Use console.info for CLI
  console.info(output);
}
