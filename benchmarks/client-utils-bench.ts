import { bench, group, run } from "mitata";
import { buildClientUrl, buildRequestInit } from "../src/client/utils";

group("RPC Client Utilities", () => {
	bench("buildClientUrl (no params)", () => {
		buildClientUrl("http://localhost", ["api", "test"]);
	});

	bench("buildClientUrl (path params)", () => {
		buildClientUrl("http://localhost", ["users", ":id"], {
			params: { id: "123" },
		});
	});

	bench("buildClientUrl (query string)", () => {
		buildClientUrl("http://localhost", ["search"], {
			query: { q: "test", page: 1, filter: ["a", "b"] },
		});
	});

	bench("buildRequestInit (GET)", () => {
		buildRequestInit("get");
	});

	bench("buildRequestInit (POST with body)", () => {
		buildRequestInit("post", {
			body: { hello: "world", id: 1 },
		});
	});
});

await run();
