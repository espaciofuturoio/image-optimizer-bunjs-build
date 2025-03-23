import { serve } from "bun";
import index from "./index.html";

const server = serve({
  routes: {
    // Serve index.html for all unmatched routes.
    "/*": index,
  },
  port: process.env.PORT || 3000,
  hostname: process.env.HOST || "0.0.0.0",
  development: process.env.NODE_ENV !== "production",
});

console.log(`🚀 Server running at ${server.url}`);
