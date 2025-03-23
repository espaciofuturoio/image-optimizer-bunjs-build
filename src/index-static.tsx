import { serve } from "bun";
import index from "./index.html";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

// Create uploads directory if it doesn't exist
if (!existsSync("uploads")) {
  mkdirSync("uploads", { recursive: true });
}

// Create public directory if it doesn't exist
if (!existsSync("public")) {
  mkdirSync("public", { recursive: true });
}

// Create public/assets directory if it doesn't exist
if (!existsSync("public/assets")) {
  mkdirSync("public/assets", { recursive: true });
}

// Copy preview image to public directory if it doesn't exist yet
if (!existsSync("public/image-optimizer-preview.webp")) {
  const previewImage = Bun.file("src/assets/image-optimizer-preview.webp");
  if (previewImage) {
    await Bun.write("public/image-optimizer-preview.webp", previewImage);
  }
}

// Handle file uploads
async function handleFileUpload(request: Request): Promise<Response> {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return new Response(
        JSON.stringify({
          success: false,
          errors: ["No file provided"],
          messages: [],
          result: null
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    const metadata = formData.get("metadata") ?
      JSON.parse(formData.get("metadata") as string) :
      {};

    const requireSignedURLs = formData.get("requireSignedURLs") ?
      JSON.parse(formData.get("requireSignedURLs") as string) :
      false;

    // Create a unique filename
    const fileId = randomUUID();
    const fileExtension = file.name.split('.').pop() || '';
    const uniqueFilename = `${fileId}.${fileExtension}`;
    const filePath = join("uploads", uniqueFilename);

    // Save the file
    await Bun.write(filePath, file);

    // Generate response
    const response = {
      success: true,
      errors: [],
      messages: ["File uploaded successfully"],
      result: {
        id: fileId,
        filename: file.name,
        meta: metadata,
        uploaded: new Date().toISOString(),
        requireSignedURLs,
        variants: [`/uploads/${uniqueFilename}`]
      }
    };

    return new Response(
      JSON.stringify(response),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (error: unknown) {
    console.error("Error processing upload:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({
        success: false,
        errors: [`Error processing upload: ${errorMessage}`],
        messages: [],
        result: null
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}

// Configure CORS headers
function setCorsHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

const server = serve({
  fetch: async (request) => {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return setCorsHeaders(new Response(null, { status: 204 }));
    }

    // Handle API upload endpoint
    if (path === "/api" && request.method === "POST") {
      const response = await handleFileUpload(request);
      return setCorsHeaders(response);
    }

    // Handle API routes
    if (path === "/ping") {
      return setCorsHeaders(new Response("Hello from Image Optimizer API!"));
    }

    if (path === "/status") {
      return setCorsHeaders(new Response("OK"));
    }

    // Handle assets
    if (path.startsWith("/assets/")) {
      const assetPath = `public/assets/${path.replace("/assets/", "")}`;
      if (existsSync(assetPath)) {
        return new Response(Bun.file(assetPath));
      }
      return new Response("Asset not found", { status: 404 });
    }

    // Handle uploads
    if (path.startsWith("/uploads/")) {
      const uploadPath = `uploads/${path.replace("/uploads/", "")}`;
      if (existsSync(uploadPath)) {
        return new Response(Bun.file(uploadPath));
      }
      return new Response("Upload not found", { status: 404 });
    }

    // Handle specific files
    if (path === "/favicon.ico") {
      return new Response(await Bun.file("./src/assets/favicon/favicon.ico").bytes(), {
        headers: {
          "Content-Type": "image/x-icon",
        },
      });
    }

    if (path === "/image-optimizer-preview.webp") {
      return new Response(Bun.file("public/image-optimizer-preview.webp"));
    }

    // Handle the index route (fallback for all other routes)
    return new Response(index);
  },
  port: process.env.PORT || 3000,
  development: process.env.NODE_ENV !== "production",
});

console.log(`🚀 Server running at ${server.url}`);
console.log(`📁 Static files are served from: ${server.url}uploads`);
