import type { Context } from "../../../src/context";
import type { Env, MiddlewareHandler } from "../../../src/types";

export function GET(c: Context<Env, "/users/:id">) {
    return c.html(`${c.params("id")}: is ${c.query("isWanking") === "true" ? "a wanker" : "not a wanker"}`)
}

export const middlewares = {
    get: [
        async(c, next) => {
            console.log(c)
            await next()
        }
    ] as MiddlewareHandler<object>[]
}