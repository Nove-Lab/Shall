import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Hono } from "hono";
import { isEmbedded, readEmbedded } from "../host/embedded.js";

/**
 * THE WEB APP, HANDED OUT — from the checkout's `apps/web/dist` when Shall runs
 * from a checkout, and from the bytes the binary carries when it does not.
 *
 * IT IS MOUNTED LAST AND IT ANSWERS EVERYTHING, which is what a client-side
 * router needs: a URL the browser was routed to has no file behind it, so
 * anything that is not an asset is answered with `index.html` and the router in
 * the page reads the path itself. `/health`, `/api/…` and `/trpc/…` are claimed
 * before this runs, so the catch-all can be exactly that.
 *
 * THE CONTENT TYPE IS SAID HERE ONLY IN THE EMBEDDED CASE. On disk
 * `serveStatic` knows the table already; in the binary there is no file for
 * anything to sniff, and a stylesheet or a font served as `text/plain` is a
 * page that renders wrong rather than an error anybody would see in a log.
 */

/**
 * Every extension the built SPA actually ships, and the one thing each is.
 * `.js` is a module and `.woff2` is a font: both are refused outright by a
 * browser when the type is wrong, so this table is a correctness fact and not a
 * nicety.
 */
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
};

export function contentTypeOf(held: string): string {
  const dot = held.lastIndexOf(".");
  const extension = dot === -1 ? "" : held.slice(dot).toLowerCase();
  return CONTENT_TYPES[extension] ?? "application/octet-stream";
}

/**
 * A request path as a carried key: leading slash off, `%20` and its kin read,
 * and every `..` segment dropped. The keys are a fixed table rather than a
 * filesystem, so a traversal cannot reach anything either way — the segments go
 * because a key that cannot be typed is a key that cannot be argued about.
 */
export function keyOf(pathname: string): string {
  let decodedPath = pathname;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    // A path that is not valid percent-encoding is read as the bytes it is.
  }
  return decodedPath
    .split("/")
    .filter((segment) => segment !== "" && segment !== "." && segment !== "..")
    .join("/");
}

/** The SPA's routes, from whichever of the two sources this Shall has. */
export function mountSpa(app: Hono, spaRoot: string | undefined): void {
  if (isEmbedded()) {
    app.get("*", (context) => {
      const asset = readEmbedded(`web/${keyOf(context.req.path)}`);
      if (asset !== undefined) {
        return context.body(new Uint8Array(asset), 200, {
          "content-type": contentTypeOf(context.req.path),
        });
      }
      const index = readEmbedded("web/index.html");
      if (index === undefined) {
        return context.notFound();
      }
      return context.html(index.toString("utf8"));
    });
    return;
  }

  if (spaRoot === undefined || !existsSync(path.join(spaRoot, "index.html"))) {
    return;
  }
  app.use("*", serveStatic({ root: spaRoot }));
  app.get("*", async (context) => {
    const html = await readFile(path.join(spaRoot, "index.html"), "utf8");
    return context.html(html);
  });
}
