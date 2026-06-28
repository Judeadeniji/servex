import { bench, group, run } from "mitata";
import { createServer } from "../src/index";

function createHeavyApp() {
	const app = createServer();
	// Simulate an app with 1000 dynamic/static routes
	for (let i = 0; i < 1000; i++) {
		app.get(`/api/test/${i}`, (c) => c.text("OK"));
	}
	return app;
}

group("AOT Precompilation vs Lazy JIT", () => {
	bench("Lazy JIT Boot (App Init + 1 Req)", async () => {
		const app = createHeavyApp();
		// The first request triggers JIT compilation
		await app.fetch(new Request("http://localhost/api/test/999"));
	});

	bench("AOT Precompilation (App Init + app.compile)", () => {
		const app = createHeavyApp();
		app.compile(); // AOT Pre-compiles all 1000 routes
	});
});

await run();
