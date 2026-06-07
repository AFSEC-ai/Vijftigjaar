import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import handler from "./api/rsvp.js";

process.env.LOCAL_DEV = "1";

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 5175);

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"]
]);

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/api/rsvp") {
    return handler(req, res);
  }

  try {
    const filePath = resolveStaticPath(url.pathname);
    const extension = path.extname(filePath).toLowerCase();
    const content = await fs.readFile(filePath);
    res.statusCode = 200;
    res.setHeader("Content-Type", mimeTypes.get(extension) || "application/octet-stream");
    res.end(content);
  } catch (error) {
    res.statusCode = error.code === "EACCES" ? 403 : 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Niet gevonden");
  }
});

server.listen(port, () => {
  console.log(`Uitnodiging draait op http://localhost:${port}`);
  console.log(`Adminstand lokaal: http://localhost:${port}/?admin=local`);
});

function resolveStaticPath(urlPathname) {
  const pathname = urlPathname === "/" ? "/index.html" : decodeURIComponent(urlPathname);
  const normalized = path.normalize(path.join(root, pathname));
  const relative = path.relative(root, normalized);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    const error = new Error("Forbidden");
    error.code = "EACCES";
    throw error;
  }

  return normalized;
}
