import { createServer } from "../src";
// @ts-ignore: Bun native HTML imports
import Page from "./index.html";

const app = createServer()
	.get("/", Page);

export default { fetch: app.fetch };
