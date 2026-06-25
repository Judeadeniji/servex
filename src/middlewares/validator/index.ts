import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { Context } from "../../context";

export type ValidationTarget = "body" | "query" | "params";

export type ValidatorMiddleware<
	T extends ValidationTarget,
	Schema extends StandardSchemaV1,
> = {
	__validator: { target: T; schema: Schema };
} & ((
	ctx: Context,
	next: () => Promise<void | Response>,
) => Promise<void | Response>);

/**
 * Creates a middleware that validates the request against a Standard Schema (Zod, Valibot, ArkType, etc.).
 *
 * @param target The part of the request to validate ("body", "query", or "params")
 * @param schema The Standard Schema to use for validation
 * @returns A middleware function
 */
export function validator<
	T extends ValidationTarget,
	Schema extends StandardSchemaV1,
>(target: T, schema: Schema): ValidatorMiddleware<T, Schema> {
	const middleware = async (
		ctx: Context,
		next: () => Promise<void | Response>,
	) => {
		let data: unknown;

		if (target === "body") {
			data = await ctx.req.json().catch(() => undefined);
		} else if (target === "query") {
			// Extract all queries into an object
			const url = new URL(ctx.req.url);
			const queryObj: Record<string, string | string[]> = {};
			for (const [key, value] of url.searchParams.entries()) {
				const existing = queryObj[key];
				if (existing) {
					if (Array.isArray(existing)) {
						existing.push(value);
					} else {
						queryObj[key] = [existing, value];
					}
				} else {
					queryObj[key] = value;
				}
			}
			data = queryObj;
		} else if (target === "params") {
			data = ctx.params;
		}

		const result = await schema["~standard"].validate(data);

		if (result.issues) {
			return ctx.json(
				{ error: "Validation failed", issues: result.issues as any },
				400,
			);
		}

		// Store validated data so `c.valid(target)` can retrieve it
		if (!ctx._validData) {
			ctx._validData = {};
		}
		(ctx._validData as Record<string, unknown>)[target] = result.value;

		await next();
	};

	// Mock property for type inference in ServeXRouter
	const validatorMiddleware = middleware as ValidatorMiddleware<T, Schema>;
	validatorMiddleware.__validator = { target, schema };

	return validatorMiddleware;
}
