import { run, bench, group } from "mitata";

const contextHelpers = {
	a() {}, b() {}, c() {}, d() {}, e() {}, f() {}, g() {}, h() {}, i() {}, j() {},
	k() {}, l() {}, m() {}, n() {}, o() {}, p() {}, q() {}, r() {}, s() {}, t() {}
};

class Context {
	req = 1;
	env = 2;
	executionCtx = 3;
	debug = 4;
	_params = 5;
	_status = 200;
	_isFinished = false;
	constructor() {}
}
Object.assign(Context.prototype, contextHelpers);

group("Context Creation", () => {
	bench("Spread", () => {
		return {
			req: 1,
			env: 2,
			executionCtx: 3,
			debug: 4,
			_params: 5,
			_status: 200,
			_isFinished: false,
			...contextHelpers
		};
	});

	bench("Class", () => {
		return new Context();
	});
});

await run();
