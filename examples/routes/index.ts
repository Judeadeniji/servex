import type { Context } from "../../src/context";

export function GET(c: Context) {
    return (
        c.text("Hello, world!")
    )
}