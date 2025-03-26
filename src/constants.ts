import type { Format } from "./types";

// Define accepted file types
export const ACCEPTED_FILE_TYPES =
	"image/jpeg,image/png,image/gif,image/webp,image/avif,image/heic,image/heif";
export const ACCEPTED_EXTENSIONS = [
	".jpg",
	".jpeg",
	".png",
	".gif",
	".webp",
	".avif",
	".heic",
	".heif",
];
export const ACCEPTED_FORMATS: Format[] = ["webp", "avif", "jpeg", "png"];

// Default configuration values
export const DEFAULT_QUALITY = 75;
export const DEFAULT_MAX_SIZE_MB = 1;
export const DEFAULT_MAX_RESOLUTION = 2048;
export const MAX_FILE_SIZE_MB = 10; // 10MB file size limit

// Use environment variable with fallback
// For client-side bundling
// export const PUBLIC_SERVER_URL =
//  "https://tinypic.rubenabix.com";
export const PUBLIC_SERVER_URL = "http://localhost:3000";
