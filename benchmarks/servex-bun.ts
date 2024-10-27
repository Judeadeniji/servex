import { createServer } from "../src";
import base from "./base";

const servexBun = createServer();

servexBun.all("/", base.fetch);


export default {
    fetch: servexBun.fetch
}