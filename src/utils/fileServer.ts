import { existsSync } from "node:fs";
import { extname } from "node:path";

// Compressor functions for different encodings
const compressors = {
	// Current Bun version doesn't have native brotli support, fallback to gzip
	br: (data: Uint8Array) => Bun.gzipSync(data),
	gzip: (data: Uint8Array) => Bun.gzipSync(data),
	deflate: (data: Uint8Array) => Bun.deflateSync(data),
};

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

// Determine which compression to use based on Accept-Encoding header
function getPreferredEncoding(
	acceptEncoding: string | null,
): keyof typeof compressors | null {
	if (!acceptEncoding) return null;

	// Check for supported compression types in order of preference
	if (acceptEncoding.includes("br")) return "br";
	if (acceptEncoding.includes("gzip")) return "gzip";
	if (acceptEncoding.includes("deflate")) return "deflate";

	return null;
}

// Compressible content types
const COMPRESSIBLE_TYPES = new Set([
	"text/html",
	"text/javascript",
	"text/css",
	"application/json",
	"application/javascript",
	"text/plain",
	"application/xml",
	"text/xml",
	"image/svg+xml",
	"application/manifest+json",
]);

// Function to serve files with proper content types
export async function serveFile(
	req: Request,
	basePath: string,
): Promise<Response> {
	const url = new URL(req.url);
	const pathname = url.pathname;
	const filePath = `${basePath}${pathname}`;

	if (existsSync(filePath)) {
		const file = Bun.file(filePath);
		const contentType =
			MIME_TYPES[extname(pathname).toLowerCase()] || "application/octet-stream";

		// Determine if we should compress this file type
		const shouldCompress = COMPRESSIBLE_TYPES.has(contentType);

		// Get preferred encoding from request headers
		const acceptEncoding = req.headers.get("Accept-Encoding");
		const preferredEncoding = shouldCompress
			? getPreferredEncoding(acceptEncoding)
			: null;

		// Default headers
		const headers: Record<string, string> = {
			"Content-Type": contentType,
			Vary: "Accept-Encoding", // Important for caching
		};

		// If compression is supported and requested
		if (preferredEncoding) {
			try {
				// Read file data
				const data = await file.arrayBuffer();
				// Compress the data
				const compressed = compressors[preferredEncoding](new Uint8Array(data));

				// Add compression headers
				headers["Content-Encoding"] = preferredEncoding;

				return new Response(compressed, { headers });
			} catch (error) {
				console.error(`Compression error: ${error}`);
				// Fall back to uncompressed if compression fails
			}
		}

		// Return uncompressed file if no compression or compression failed
		return new Response(file, { headers });
	}

	const notFoundMessage = pathname.startsWith("/assets")
		? "Asset not found"
		: "Upload not found";
	return new Response(notFoundMessage, { status: 404 });
}
