import { z } from "zod";
import { createServer, validator } from "../src";

const app = createServer()
	.post(
		"/",
		validator("body", z.object({
			username: z.string(),
			password: z.string(),
			nested: z.object({
				hi: z.string()
			}).optional()
		})),
		(c) => c.json(c.valid("body"))
	);

export default { fetch: app.fetch };
