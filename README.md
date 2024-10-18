# ServeX (Codename: Aether)

ServeX is a high-performance, extensible HTTP server framework inspired by Express, Hono, and Fastify. It aims to deliver blazing speed, rock-solid reliability, and effortless elegance for modern web applications.

## Features

- **Modular Design**: Core components are separated into distinct modules for better maintainability and scalability.
- **Plugin System**: Extensible through plugins or modules that can be added or removed as needed.
- **High Performance**: Optimized for speed and efficiency, supporting HTTP/1.1 and HTTP/2.
- **Middleware Support**: Built-in and custom middleware support for flexible request handling.
- **Static File Serving**: Efficiently serve static assets with caching strategies.
- **Templating Engine**: Built-in templating engine for dynamic content rendering.
- **API Support**: Facilitate the creation of RESTful APIs and WebSockets for real-time communication.
- **Security Features**: HTTPS support, authentication, authorization, input validation, and more.
- **Scalability**: Efficient concurrency model, load balancing, and caching strategies.
- **Logging and Monitoring**: Structured logging and integration with monitoring tools.
- **Error Handling**: Global error handlers and custom error pages.
- **Internationalization**: Support for multiple languages and locales.

## Getting Started

### Installation

```bash
npm install servex
```

### Basic Usage

```typescript
import { route } from "servex/router";
import { createServer } from "servex";

const app = createServer({
    routes: [
        route("GET /", (c) => c.text("Hello World")),
        route("GET /stream", (c) => {
            const readableStream = new ReadableStream({
                async start(controller) {
                    const encoder = new TextEncoder();
                    controller.enqueue(encoder.encode("First chunk\n"));
                    await new Promise((resolve) => setTimeout(resolve, 3000));
                    controller.enqueue(encoder.encode("Second chunk\n"));
                    await new Promise((resolve) => setTimeout(resolve, 3000));
                    controller.close();
                }
            });
            return c.stream(readableStream);
        }),
    ],
});

export default {
    fetch: app.fetch,
};
```

### Running the Server

```bash
node dist/index.js
```

## Documentation

For detailed documentation, visit the [ServeX Documentation](https://github.com/judeadeniji/servex#readme).

## Contributing

We welcome contributions! Please read our [Contributing Guide](https://github.com/judeadeniji/servex/blob/main/CONTRIBUTING.md) to get started.

## License

ServeX is licensed under the MIT License. See the [LICENSE](https://github.com/judeadeniji/servex/blob/main/LICENSE) file for more information.

## Contact

Author: Adeniji Oluwaferanmi  
Email: <adenijiferanmi64@gmail.com>

For issues and feature requests, please visit the [GitHub Issues](https://github.com/judeadeniji/servex/issues) page.
