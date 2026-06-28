import { run, bench, group } from "mitata";

const contextHelpers = {
	a: 1,
	b: 2,
	c: 3,
	d: 4,
	e: 5,
	f: 6,
	g: 7,
	h: 8,
	i: 9,
	j: 10,
	k: 11,
	l: 12,
	m: 13,
	n: 14,
	o: 15,
	p: 16,
	q: 17,
	r: 18,
	s: 19,
	t: 20,
};

class Context {
	req = 1;
	env = 2;
	executionCtx = 3;
	debug = 4;
	_params = 5;
	_status = 200;
	_isFinished = false;
	a = 1;
	b = 2;
	c = 3;
	d = 4;
	e = 5;
	f = 6;
	g = 7;
	h = 8;
	i = 9;
	j = 10;
	k = 11;
	l = 12;
	m = 13;
	n = 14;
	o = 15;
	p = 16;
	q = 17;
	r = 18;
	s = 19;
	t = 20;
}

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
			...contextHelpers,
		};
	});

	bench("Object.create + assign", () => {
		return Object.assign(Object.create(contextHelpers), {
			req: 1,
			env: 2,
			executionCtx: 3,
			debug: 4,
			_params: 5,
			_status: 200,
			_isFinished: false,
		});
	});

	bench("Object.create with literal", () => {
		const obj = Object.create(contextHelpers);
		obj.req = 1;
		obj.env = 2;
		obj.executionCtx = 3;
		obj.debug = 4;
		obj._params = 5;
		obj._status = 200;
		obj._isFinished = false;
		return obj;
	});

	bench("Class", () => {
		return new Context();
	});
});

await run();
