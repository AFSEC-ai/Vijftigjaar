import { promises as fs } from "node:fs";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");
const files = ["index.html", "styles.css", "script.js"];

await fs.rm(dist, { recursive: true, force: true });
await fs.mkdir(path.join(dist, "assets"), { recursive: true });

for (const file of files) {
  await fs.copyFile(path.join(root, file), path.join(dist, file));
}

await fs.cp(path.join(root, "assets"), path.join(dist, "assets"), { recursive: true });

console.log("Static invite built to dist/");
