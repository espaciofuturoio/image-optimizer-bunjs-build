import { serve } from "bun";
import index from "./index.html";
import { existsSync, mkdirSync } from "node:fs";
import { extname } from "node:path";

// Map file extensions to MIME types
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const server = serve({
  routes: {
    // Serve index.html for all unmatched routes.
    "/*": index,
    "/status": new Response("OK"),
    "/assets/*": async (req) => {
      console.log("----> assets");
      const url = new URL(req.url);
      const pathname = url.pathname;
      console.log(pathname);
      const assetPath = `src${pathname}`;
      if (existsSync(assetPath)) {
        const ext = extname(pathname).toLowerCase();
        const contentType = MIME_TYPES[ext] || "application/octet-stream";
        // Serve a file by buffering it in memory
        return new Response(await Bun.file(assetPath).bytes(), {
          headers: {
            "Content-Type": contentType,
          },
        });
      }
      return new Response("Asset not found", { status: 404 });
    },
  },
  port: process.env.PORT || 3000,
  development: process.env.NODE_ENV !== "production",
});

console.log(`🚀 Server running at ${server.url}`);
