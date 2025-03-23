import { serve } from "bun";
import index from "./index.html";

const server = serve({
  routes: {
    // Serve index.html for all unmatched routes.
    "/*": index,
    "/status": new Response("OK"),
    // Serve a file by buffering it in memory
    "/favicon.ico": new Response(await Bun.file("./src/assets/favicon/favicon.ico").bytes(), {
      headers: {
        "Content-Type": "image/x-icon",
      },
    }),
  },
  port: process.env.PORT || 3000,
  development: process.env.NODE_ENV !== "production",
});

console.log(`🚀 Server running at ${server.url}`);
