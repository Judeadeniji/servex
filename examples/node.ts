import { server } from "../src/node"
import app from "./base"
import fs from "node:fs"



server(app.fetch, { http2: false, tlsOptions: {
    enableTrace: true,
      key: fs.readFileSync('./localhost.key'), 
      cert: fs.readFileSync('./localhost.crt'),
} })
.listen(8433, () => {
    console.log("Server Started")
})