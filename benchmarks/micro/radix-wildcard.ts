import { RadixRouteTrie } from "../src/router/radix-router";

const router = new RadixRouteTrie();
router.addRoute({ method: "GET", path: "/files/*path", data: { route: 1 } });
const match = router.match("GET", "/files/");
console.log(match);
