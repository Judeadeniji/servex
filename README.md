<div align="center">
  <h1>🚀 ServeX</h1>
  <p><b>A high-performance, TypeScript-first HTTP framework built natively for Bun.</b></p>
  
  [![npm version](https://img.shields.io/npm/v/servex.svg?style=flat-square)](https://www.npmjs.org/package/servex)
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
  [![Bun](https://img.shields.io/badge/Bun-%23000000.svg?style=flat-square&logo=bun&logoColor=white)](https://bun.sh)
</div>

<hr/>

**ServeX** (Codename: Aether) is an extensible HTTP server framework inspired by Express, Hono, and Fastify. Built from the ground up for [Bun](https://bun.sh/), ServeX aims to deliver **blazing speed**, **rock-solid reliability**, and **effortless elegance** for modern web applications. Performance is our non-negotiable priority.

---

## ✨ Features

- **Built for Bun**: Natively leverages Bun's optimized APIs and JIT compilation for maximum performance.
- **TypeScript-First**: Exceptional developer experience with strict typing and built-in type inference.
- **Blazing Fast**: Architecture optimized for minimal overhead, fast routing, and V8 performance.
- **Declarative Routing**: Elegant and easy-to-read route definitions.
- **Extensible**: Plugin system to extend functionality without compromising core performance.
- **Streaming & WebSockets**: Native support for modern real-time communication patterns.
- **Standard Schema Validation**: Built-in support for input validation via `@standard-schema/spec`.

## 📦 Installation

Since ServeX is built for Bun, ensure you have [Bun installed](https://bun.sh/docs/installation), then run:

```bash
bun add servex
```

## 🚀 Quick Start

Create an `index.ts` file and set up your first ServeX application:

```typescript
import { createServer } from "servex";

const app = createServer()
    // Simple text response
    .get("/", (c) => c.text("Hello from ServeX! 👋"))
    
    // Streaming response
    .get("/stream", (c) => {
        const readableStream = new ReadableStream({
            async start(controller) {
                const encoder = new TextEncoder();
                controller.enqueue(encoder.encode("First chunk\n"));
                await Bun.sleep(1000);
                controller.enqueue(encoder.encode("Second chunk\n"));
                controller.close();
            }
        });
        return c.stream(readableStream);
    });

export default {
    fetch: app.fetch,
};
```

Run your server using Bun:

```bash
bun run index.ts
```

Your server will start and be ready to handle requests!

## 📖 Documentation

For detailed guides, API references, and advanced usage, please check the [ServeX Documentation](https://github.com/judeadeniji/servex#readme) *(Coming Soon)*.

## 🏎️ Performance & Benchmarking

ServeX is designed with a relentless focus on performance. We continuously benchmark against leading frameworks like Elysia, Hono, and Fastify to ensure minimal overhead.

To run the local benchmarks, clone the repository and run:

```bash
bun run bench
```

*(Check out the `benchmarks/` directory for more details).*

## 🤝 Contributing

We welcome contributions from the community! If you're interested in helping us build the fastest framework for Bun, please read our [Contributing Guide](https://github.com/judeadeniji/servex/blob/main/CONTRIBUTING.md) to get started.

> **Note on Performance:** Every architectural decision in this codebase exists for a reason. If you're contributing, please ensure your changes do not regress performance. Review our internal rules for V8/Bun JIT optimization before submitting a PR.

## 📄 License

ServeX is open-sourced software licensed under the [MIT License](https://github.com/judeadeniji/servex/blob/main/LICENSE).

## 💬 Contact

- **Author:** Adeniji Oluwaferanmi (<adenijiferanmi64@gmail.com>)
- **Issues & Feature Requests:** Please visit the [GitHub Issues](https://github.com/judeadeniji/servex/issues) page.
