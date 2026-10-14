// Serves the built operator dashboard (distress-intelligence/dist/public) with
// an /api reverse proxy to the API server. Production-mode serving: no HMR,
// no dev websockets, one static bundle — reliable on forwarded/public URLs.
import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { fileURLToPath } from "url";
import path from "path";
import { existsSync } from "fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const dashboardBuild = path.resolve(here, "..", "distress-intelligence", "dist", "public");

if (!existsSync(path.join(dashboardBuild, "index.html"))) {
  console.error(`Dashboard build missing at ${dashboardBuild}. Run the frontend build first.`);
  process.exit(1);
}

const port = Number(process.env.PORT ?? 5173);
const apiPort = Number(process.env.API_PROXY_TARGET_PORT ?? 5000);

const app = express();
app.use(
  createProxyMiddleware({
    pathFilter: "/api",
    target: `http://127.0.0.1:${apiPort}`,
    changeOrigin: true,
  }),
);
app.use(express.static(dashboardBuild));
// SPA fallback for client-side routes
app.use((_req, res) => {
  res.sendFile(path.join(dashboardBuild, "index.html"));
});

app.listen(port, () => {
  console.log(`Dashboard (production build) listening on port ${port}, /api proxied to port ${apiPort}`);
});
