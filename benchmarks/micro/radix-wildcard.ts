import { RadixRouteTrie } from "../../src/router/radix-router";

const router = new RadixRouteTrie();
router.addRoute({
	method: "GET",
	path: "/files/*path",
	handlers: [
		{ route: 1 } as unknown as import("../../src/types").InternalHandler,
	],
});
const match = router.match("GET", "/files/");
console.log(match);
