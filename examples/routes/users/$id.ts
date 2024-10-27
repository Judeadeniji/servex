import type { Context } from "../../../src/context";
import type { Env } from "../../../src/types";

export function POST(c: Context<Env, "/:id">) {
    return c.text("Hi Post")
}