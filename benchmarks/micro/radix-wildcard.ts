import { RadixRouteTrie } from "../../src/router/radix-router";
import type { InternalHandler } from "../../src/types";

const router = new RadixRouteTrie();
router.addRoute({
	method: "GET",
	path: "/files/*path",
	handlers: [
		{ route: 1 } as unknown as InternalHandler,
	],
});
const match = router.match("GET", "/files/");
console.log(match);
