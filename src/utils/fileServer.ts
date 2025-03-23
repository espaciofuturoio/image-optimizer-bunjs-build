import { existsSync } from "node:fs";
import { extname } from "node:path";

// Map file extensions to MIME types
export const MIME_TYPES: Record<string, string> = {
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
	".webmanifest": "application/manifest+json",
	".avif": "image/avif",
};

// Function to serve files with proper content types
export function serveFile(req: Request, basePath: string): Response {
	const url = new URL(req.url);
	const pathname = url.pathname;
	const filePath = `${basePath}${pathname}`;

	if (existsSync(filePath)) {
		const file = Bun.file(filePath);
		const contentType =
			MIME_TYPES[extname(pathname).toLowerCase()] || "application/octet-stream";
		return new Response(file, {
			headers: {
				"Content-Type": contentType,
			},
		});
	}

	const notFoundMessage = pathname.startsWith("/assets")
		? "Asset not found"
		: "Upload not found";
	return new Response(notFoundMessage, { status: 404 });
}
