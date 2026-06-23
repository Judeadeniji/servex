import { Elysia } from "elysia";

new Elysia({ nativeStaticResponse: true }).get("/", "ok").listen(3001);
console.log("[elysia] listening on :3001");
