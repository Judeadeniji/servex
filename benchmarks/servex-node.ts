import { createServer } from "../src";
import { server as nodeServer } from "../src/node";
import base from "./base";

const server = createServer();

server.get("/", base.fetch);

nodeServer(server.fetch).listen(3000, () => {
    console.log("Listening on http://localhost:3000");
});
