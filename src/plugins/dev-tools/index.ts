import type { Env, Plugin, PluginContext } from "../../types";

type DevToolsOptions = {
  path?: string;
};

interface Env2 extends Env {
  Globals: {
    "dt:ts": number;
  };
}

type RequestLogEntry = {
  method: string;
  url: string;
  headers: Headers;
  timestamp: number;
};

type ResponseLogEntry = {
  status: number;
  url: string;
  headers: Headers;
  duration: number;
};

function devTools<E extends Env>(options?: DevToolsOptions) {
  const _options = {
    ...(options || {}),
    path: options?.path || "/_devtools",
  };

  // Store request and response data for the dashboard
  const requestLog: RequestLogEntry[] = [];
  const responseLog: ResponseLogEntry[] = [];

  return {
    name: "Plugin Devtools",
    onInit(pluginContext: PluginContext<Env2>) {
      const { server, events$, env } = pluginContext;

      events$.onRequest(async (rc, request) => {
        const { method, url, headers } = request;
        const timestamp = Date.now();
        requestLog.push({ method, url, headers, timestamp });

        // Limit log size to prevent memory issues
        if (requestLog.length > 100) {
          requestLog.shift();
        }

        // Add start time for performance measurement
        rc.globals.set("dt:ts", timestamp);
      });

      events$.onResponse(async (rc, response) => {
        const { status, headers } = response;
        const duration = Date.now() - rc.globals.get("dt:ts")!;
        responseLog.push({ status, headers, duration, url: rc.path });

        // Limit log size to prevent memory issues
        if (responseLog.length > 100) {
          responseLog.shift();
        }
      });

      // Serve the devtools dashboard
      server.get(_options.path, (c) => {
        const dashboardHtml = generateDashboardHtml(requestLog, responseLog);
        c.setHeaders({ "Content-Type": "text/html" });
        return c.html(dashboardHtml);
      });
    },
  } as unknown as Plugin<E>;
}

// Generate HTML for the devtools dashboard
function generateDashboardHtml(
  requestLog: RequestLogEntry[],
  responseLog: ResponseLogEntry[]
): string {
  const requestRows = requestLog
    .map(
      (log, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${log.method}</td>
        <td>${log.url}</td>
        <td>${new Date(log.timestamp).toLocaleString()}</td>
        <td>
          <button onclick="toggleHeaders('request-headers-${index}')">Show Headers</button>
          <ul class="header-list" id="request-headers-${index}" style="display: none;">${formatHeaders(log.headers)}</ul>
        </td>
      </tr>
    `
    )
    .join("");

  const responseRows = responseLog
    .map(
      (log, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${log.url}</td>
        <td>${log.status}</td>
        <td>${log.duration} ms</td>
        <td>
          <button onclick="toggleHeaders('response-headers-${index}')">Show Headers</button>
          <ul class="header-list" id="response-headers-${index}" style="display: none;">${formatHeaders(log.headers)}</ul>
        </td>
      </tr>
    `
    )
    .join("");

  const avgResponseTime = (responseLog.reduce((acc, log) => acc + log.duration, 0) / responseLog.length).toFixed(2);

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>ServeX DevTools</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f9f9f9; }
        .container { max-width: 1200px; margin: auto; padding: 20px; background: white; box-shadow: 0 0 10px rgba(0, 0, 0, 0.1); }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f4f4f4; }
        tr:nth-child(even) { background-color: #f9f9f9; }
        pre { white-space: pre-wrap; word-wrap: break-word; }
        h1, h2 { margin-top: 0; }
        .search-bar { margin-bottom: 20px; }
        .search-bar input { width: calc(100% - 100px); padding: 8px; }
        .search-bar button { padding: 8px 16px; }
        .stats { margin-bottom: 20px; }
        .stat { display: inline-block; margin-right: 20px; }
        .stat span { font-weight: bold; }
        .header-list { list-style: none; padding: 0; margin: 0; }
        .header-list li { margin-bottom: 5px; }
        button { padding: 4px 8px; margin-top: 8px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>ServeX DevTools</h1>
        <form class="search-bar" onsubmit="searchLogs()">
          <input type="text" id="searchInput" placeholder="Search logs..." oninput="searchLogs()">
          <button>Search</button>
        </form>
        <div class="stats">
          <div class="stat">Server Status: <span>Online</span></div>
          <div class="stat">Average Response Time: <span>${avgResponseTime} ms</span></div>
        </div>
        <h2>Requests</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Method</th>
              <th>URL</th>
              <th>Timestamp</th>
              <th>Headers</th>
            </tr>
          </thead>
          <tbody id="requestLogTable">
            ${requestRows}
          </tbody>
        </table>
        <h2>Responses</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>URL</th>
              <th>Status</th>
              <th>Duration</th>
              <th>Headers</th>
            </tr>
          </thead>
          <tbody id="responseLogTable">
            ${responseRows}
          </tbody>
        </table>
      </div>
      <script>
        function searchLogs() {
          const input = document.getElementById('searchInput').value.toLowerCase();
          const requestLogTable = document.getElementById('requestLogTable');
          const responseLogTable = document.getElementById('responseLogTable');

          for (const row of requestLogTable.rows) {
            const cells = Array.from(row.cells).map(cell => cell.textContent.toLowerCase());
            row.style.display = cells.some(cell => cell.includes(input)) ? '' : 'none';
          }

          for (const row of responseLogTable.rows) {
            const cells = Array.from(row.cells).map(cell => cell.textContent.toLowerCase());
            row.style.display = cells.some(cell => cell.includes(input)) ? '' : 'none';
          }
        }

        function toggleHeaders(id) {
          const headersElement = document.getElementById(id);        }

        function formatHeaders(headers) {
          const headerList = Object.entries(headers).map(([key, value]) => \`<li>\${key}: \${value}</li>\`).join('');
          return \`<ul class="header-list">\${headerList}</ul>\`;
        }
      </script>
    </body>
    </html>
  `;
}

// Helper function to format headers
function formatHeaders(headers: Headers): string {
  const headerEntries = Array.from(Object.entries(headers.toJSON()));
  return headerEntries.map(([key, value]) => `${key}: ${value}`).join('\n');
}

export { devTools };
