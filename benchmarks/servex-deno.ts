import { createServer } from "../src";
import base from "./base";

const server = createServer();

server.all("/", base.fetch);

export default {
    fetch: server.fetch
}