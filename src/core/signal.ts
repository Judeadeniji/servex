/**
 * Go-style context.Context for Node.js / Hono
 *
 * Rules:
 *  - Cancellation flows DOWN  (parent cancel → all descendants cancelled)
 *  - Values flow UP           (child lookup → walks ancestors until found)
 *  - cancel() deregisters the node from its parent (prevents memory leaks)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Context {
	/** AbortSignal that fires when this context is cancelled or times out. */
	readonly signal: AbortSignal;

	/** Walk up the tree to find the nearest value stored under key. */
	value<T = unknown>(key: string): T | undefined;

	/** True if this context has been cancelled or has timed out. */
	readonly done: boolean;

	/** The reason this context was cancelled, if any. */
	readonly error: unknown;
}

export type CancelFn = () => void;
export type CancelContext = [ctx: Context, cancel: CancelFn];

// ─── Internal base ────────────────────────────────────────────────────────────

abstract class BaseContext implements Context {
	protected _children = new Set<ChildContext>();

	abstract readonly signal: AbortSignal;
	abstract value<T = unknown>(key: string): T | undefined;
	abstract readonly done: boolean;
	abstract readonly error: unknown;

	_register(child: ChildContext) {
		this._children.add(child);
	}

	_deregister(child: ChildContext) {
		this._children.delete(child);
	}

	_propagate(reason: unknown) {
		for (const child of this._children) {
			child._cancel(reason);
		}
		this._children.clear();
	}
}

// ─── Background ───────────────────────────────────────────────────────────────

class BgContext extends BaseContext {
	readonly #ctrl = new AbortController();

	get signal() {
		return this.#ctrl.signal;
	}
	get done() {
		return false;
	}
	get error() {
		return undefined;
	}
	value<T = unknown>(_key: string): T | undefined {
		return undefined;
	}
}

// ─── Child context base ───────────────────────────────────────────────────────

abstract class ChildContext extends BaseContext {
	protected readonly _parent: BaseContext;
	protected readonly _controller: AbortController;
	protected _error: unknown = undefined;

	constructor(parent: BaseContext) {
		super();
		this._parent = parent;
		this._controller = new AbortController();

		if (parent.done) {
			// Parent already cancelled — cancel immediately
			this._error = parent.error;
			this._controller.abort(parent.error);
		} else {
			// Subscribe to parent's cancellation
			parent.signal.addEventListener(
				"abort",
				() => this._cancel(parent.signal.reason),
				{ once: true },
			);
		}

		parent._register(this);
	}

	get signal() {
		return this._controller.signal;
	}
	get done() {
		return this._controller.signal.aborted;
	}
	get error() {
		return this._error;
	}

	_cancel(reason: unknown) {
		if (this.done) return;

		this._error = reason;
		this._controller.abort(reason);
		this._propagate(reason); // cascade down
		this._parent._deregister(this); // detach from parent → GC eligible
	}

	abstract value<T = unknown>(key: string): T | undefined;
}

// ─── CancelContext ─────────────────────────────────────────────────────────────

class CancelContextImpl extends ChildContext {

	value<T = unknown>(key: string): T | undefined {
		return this._parent.value<T>(key);
	}
}

// ─── ValueContext ──────────────────────────────────────────────────────────────

class ValueContextImpl extends ChildContext {
	readonly #key: string;
	readonly #val: unknown;

	constructor(parent: BaseContext, key: string, val: unknown) {
		super(parent);
		this.#key = key;
		this.#val = val;
	}

	value<T = unknown>(key: string): T | undefined {
		if (key === this.#key) return this.#val as T;
		return this._parent.value<T>(key); // walk up the tree
	}
}

// ─── TimeoutContext ────────────────────────────────────────────────────────────

class TimeoutContextImpl extends ChildContext {
	readonly #timer: ReturnType<typeof setTimeout>;

	constructor(parent: BaseContext, ms: number) {
		super(parent);

		this.#timer = setTimeout(() => {
			this._cancel(new Error(`context deadline exceeded after ${ms}ms`));
		}, ms);

		// Clear timer if cancelled before deadline
		this._controller.signal.addEventListener(
			"abort",
			() => clearTimeout(this.#timer),
			{ once: true },
		);
	}

	value<T = unknown>(key: string): T | undefined {
		return this._parent.value<T>(key);
	}
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * The root of every context tree.
 * Never cancels, holds no values, has no deadline.
 */
export function background(): Context {
	const _bg = new BgContext();
	return _bg;
}

/**
 * Returns a child context + a cancel function.
 * Calling cancel() cancels this node and all descendants,
 * then deregisters from the parent (safe to GC).
 *
 * Always call cancel() when done:
 * @example
 * const [ctx, cancel] = withCancel(background());
 * try { await doWork(ctx); } finally { cancel(); }
 */
export function withCancel(parent: Context): CancelContext {
	const ctx = new CancelContextImpl(parent as BaseContext);
	return [ctx, () => ctx._cancel(new Error("context cancelled"))];
}

/**
 * Returns a child context that auto-cancels after `ms` milliseconds.
 * Also returns a cancel function for early cancellation.
 *
 * @example
 * const [ctx, cancel] = withTimeout(parent, 5000);
 * try { await fetch(url, { signal: ctx.signal }); } finally { cancel(); }
 */
export function withTimeout(parent: Context, ms: number): CancelContext {
	const ctx = new TimeoutContextImpl(parent as BaseContext, ms);
	return [ctx, () => ctx._cancel(new Error("context cancelled"))];
}

/**
 * Returns a child context with a key/value pair attached.
 * Descendants can read values from any ancestor via value().
 *
 * @example
 * const ctx = withValue(parent, "userId", "abc123");
 * ctx.value("userId"); // "abc123"
 */
export function withValue<T>(parent: Context, key: string, val: T): Context {
	return new ValueContextImpl(parent as BaseContext, key, val);
}
