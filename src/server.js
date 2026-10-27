import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assetMime, resolveThemeAsset, rewriteThemeUrls } from "./theme.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, "../public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml"
};

function send(res, status, body, contentType = "text/plain; charset=utf-8", headers = {}) {
  res.writeHead(status, {
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self' data: https: http:; img-src 'self' data: https: http:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    ...headers
  });
  res.end(body);
}

export async function startServer(presentation, { host = "127.0.0.1", port = 0 } = {}) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${host}`);
    if (req.method !== "GET" && req.method !== "HEAD") {
      return send(res, 405, "Method not allowed");
    }

    if (url.pathname === "/api/presentation") {
      return send(res, 200, JSON.stringify({
        title: presentation.title,
        theme: presentation.theme,
        slides: presentation.slides
      }), "application/json; charset=utf-8");
    }

    if (url.pathname === "/presentation.css") {
      const css = rewriteThemeUrls(presentation.themeCss ?? "");
      return send(res, 200, css, "text/css; charset=utf-8", { "Cache-Control": "no-store" });
    }

    if (url.pathname.startsWith("/presentation-file/")) {
      // pathname is already percent-decoded. Decoding it again would turn %252e%252e into "..".
      const relative = url.pathname.slice("/presentation-file/".length);
      const file = await resolveThemeAsset(presentation.root, relative);
      if (!file) return send(res, 403, "Forbidden");
      const mime = assetMime(file) ?? "application/octet-stream";
      const body = await fs.readFile(file);
      return send(res, 200, body, mime, {
        "Cache-Control": "no-store",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; sandbox"
      });
    }

    const requested = url.pathname === "/" ? "/index.html" : url.pathname;
    const safeName = path.normalize(requested).replace(/^(\.\.(\/|\\|$))+/, "");
    const filePath = path.resolve(publicDir, `.${safeName}`);
    if (!filePath.startsWith(publicDir + path.sep) && filePath !== publicDir) {
      return send(res, 403, "Forbidden");
    }

    try {
      const body = await fs.readFile(filePath);
      return send(res, 200, body, MIME[path.extname(filePath)] ?? "application/octet-stream");
    } catch {
      return send(res, 404, "Not found");
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  return {
    server,
    host,
    port: address.port,
    url: `http://${host}:${address.port}`
  };
}
