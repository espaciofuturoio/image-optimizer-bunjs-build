import { serve } from "bun";
import index from "./index.html";
import { serveFile } from "./utils/fileServer";

const server = serve({
  routes: {
    // Serve index.html for all unmatched routes.
    "/*": index,
    "/status": new Response("OK"),
    "/sitemap.xml": new Response(await Bun.file("./src/sitemap.xml").bytes(), {
      headers: {
        "Content-Type": "application/xml",
      },
    }),
    "/robots.txt": new Response(await Bun.file("./src/robots.txt").bytes(), {
      headers: {
        "Content-Type": "text/plain",
      },
    }),

    // Helper function to serve files with proper MIME types and compression when supported
    "/assets/*": (req) => serveFile(req, "src"),
    "/uploads/*": (req) => serveFile(req, "uploads"),
  },
  port: process.env.PORT || 3000,
  development: process.env.NODE_ENV !== "production",
});

console.log(`🚀 Server running at ${server.url}`);
