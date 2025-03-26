import { serve } from "bun";
import index from "./index.html";
import { handleUploadOptimize } from "./routes/optimize";
import { ENV } from "./env";
import { serveUploads } from "./utils/fileServer";

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
    "/image-optimizer-preview.webp": new Response(await Bun.file("./src/assets/image-optimizer-preview.webp").bytes(), {
      headers: {
        "Content-Type": "image/webp",
      },
    }),
    "/api/v1/upload/optimize": {
      POST: async (req) => {
        const response = await handleUploadOptimize(req);
        return Response.json(response);
      },
    },
    "/uploads/*": (req) => serveUploads(req),
  },
  error(error) {
    console.error(error);
    return new Response(`Internal Error: ${error.message}`, {
      status: 500,
      headers: {
        "Content-Type": "text/plain",
      },
    });
  },
  port: ENV.PORT,
  development: ENV.NODE_ENV !== "production",
});

console.log(`🚀 Server running at ${server.url}`);
