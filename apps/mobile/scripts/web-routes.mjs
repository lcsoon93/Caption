// L'export web è una single-page app (un solo index.html). Gli hosting statici
// rispondono 404 se si apre direttamente /create o si ricarica la pagina:
// copiamo index.html in ogni rotta, così funziona su qualsiasi hosting statico.
import { copyFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const dist = process.argv[2] ?? "dist";
const appDir = new URL("../app/", import.meta.url).pathname;

function routes(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return routes(full);
    if (!/\.tsx?$/.test(name) || name.startsWith("_") || name.startsWith("+")) return [];
    const route = relative(appDir, full)
      .replace(/\.tsx?$/, "")
      .split("/")
      .filter((seg) => !/^\(.*\)$/.test(seg)) // i gruppi come (tabs) non compaiono nell'URL
      .join("/");
    return route === "index" || route === "" ? [] : [route.replace(/\/index$/, "")];
  });
}

const found = routes(appDir);
for (const route of found) {
  mkdirSync(join(dist, route), { recursive: true });
  copyFileSync(join(dist, "index.html"), join(dist, route, "index.html"));
}
copyFileSync(join(dist, "index.html"), join(dist, "404.html"));
console.log(`web-routes: ${found.join(", ")} + 404.html`);
