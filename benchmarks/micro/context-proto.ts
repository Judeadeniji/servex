import { run, bench, group } from "mitata";

const contextHelpers = {
	a() {}, b() {}, c() {}, d() {}, e() {}, f() {}, g() {}, h() {}, i() {}, j() {},
	k() {}, l() {}, m() {}, n() {}, o() {}, p() {}, q() {}, r() {}, s() {}, t() {}
};

group("Context Creation", () => {
	bench("Object.create", () => {
		const ctx = Object.create(contextHelpers);
		ctx.req = 1;
		ctx.env = 2;
		ctx.executionCtx = 3;
		ctx.debug = 4;
		ctx._params = 5;
		ctx._status = 200;
		ctx._isFinished = false;
		return ctx;
	});

	bench("__proto__", () => {
		return {
			__proto__: contextHelpers,
			req: 1,
			env: 2,
			executionCtx: 3,
			debug: 4,
			_params: 5,
			_status: 200,
			_isFinished: false,
		};
	});
});

await run();
