import imageCompression from "browser-image-compression";
import { blobToWebP } from "webp-converter-browser";
import convert from "heic-convert/browser";
import { API_BASE_URL } from "./constants";

const DEFAULT_QUALITY = 75;

export type CompressOptions = {
	maxSizeMB: number;
	maxWidthOrHeight: number | undefined;
	useWebWorker: boolean;
	alwaysKeepResolution: boolean;
};

export type OptimizeImageOptions = {
	format: "webp" | "avif" | "jpeg" | "png";
	quality: number;
	width?: number;
	height?: number;
	isHeic?: boolean;
	sourceFormat?: string;
};

export type OptimizedImageResult = {
	success: boolean;
	error?: string;
	url: string;
	blob?: Blob;
	size: number;
	width: number;
	height: number;
	format: string;
	compressionRatio?: number;
	originalSize?: number;
};

export const compressImage = async (
	file: File,
	options: CompressOptions,
): Promise<File> => {
	const compressedBlob = await imageCompression(file, {
		maxSizeMB: options.maxSizeMB,
		maxWidthOrHeight:
			options.maxWidthOrHeight === 0 || options.alwaysKeepResolution
				? undefined
				: options.maxWidthOrHeight,
		useWebWorker: options.useWebWorker,
		alwaysKeepResolution: options.alwaysKeepResolution,
	});

	// Recreate the File object with the original file name.
	const compressedFile = new File([compressedBlob], file.name, {
		type: compressedBlob.type,
		lastModified: file.lastModified,
	});

	return compressedFile;
};

export const convertToWebP = async (
	file: File,
	quality = DEFAULT_QUALITY,
): Promise<File> => {
	try {
		const webpBlob = await blobToWebP(file, { quality: quality / 100 });
		const originalNameWithoutExtension = file.name.replace(/\.[^/.]+$/, "");
		const newName = `${originalNameWithoutExtension}.webp`;

		return new File([webpBlob], newName, { type: "image/webp" });
	} catch (error) {
		console.error("WebP conversion failed:", error);
		throw error;
	}
};

export const optimizeImageServer = async (
	file: File,
	options: OptimizeImageOptions,
): Promise<OptimizedImageResult> => {
	try {
		// Determine source format from mime type or file extension
		let sourceFormat = file.type.split("/")[1] || "";
		if (!sourceFormat) {
			const fileExt = file.name.split(".").pop()?.toLowerCase() || "";
			if (
				["jpg", "jpeg", "png", "webp", "avif", "gif", "heic", "heif"].includes(
					fileExt,
				)
			) {
				sourceFormat = fileExt === "jpg" ? "jpeg" : fileExt;
			}
		}

		const formData = new FormData();
		formData.append("file", file);
		formData.append("format", options.format);
		formData.append("quality", options.quality.toString());
		if (options.width) formData.append("width", options.width.toString());
		if (options.height) formData.append("height", options.height.toString());
		if (options.isHeic) formData.append("isHeic", "true");
		if (sourceFormat) formData.append("sourceFormat", sourceFormat);

		console.log(
			`Uploading file for server optimization: format=${options.format}, sourceFormat=${sourceFormat}`,
		);

		// Log the FormData entries for debugging
		console.log("FormData entries:");
		for (const pair of formData.entries()) {
			console.log(`- ${pair[0]}: ${pair[1]}`);
		}

		// Send the request to the server endpoint
		const response = await fetch(`${API_BASE_URL}/upload/optimize`, {
			method: "POST",
			body: formData,
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error("Server error:", errorText);
			return {
				success: false,
				error: `Server error: ${response.status} ${errorText}`,
				url: "",
				size: 0,
				width: 0,
				height: 0,
				format: options.format,
			};
		}

		const result = await response.json();

		if (!result.success || !result.result) {
			console.error("API error:", result.error || "Unknown error");
			return {
				success: false,
				error: result.error || result.details || "Unknown error",
				url: "",
				size: 0,
				width: 0,
				height: 0,
				format: options.format,
			};
		}

		// Ensure URL is absolute
		let imageUrl = result.result.url;
		if (imageUrl.startsWith("/")) {
			imageUrl = `${API_BASE_URL}${imageUrl}`;
		}

		const serverResult = result.result;

		return {
			success: true,
			url: imageUrl,
			size: serverResult.size,
			width: serverResult.width,
			height: serverResult.height,
			format: serverResult.format,
			originalSize: file.size,
			compressionRatio: file.size > 0 ? serverResult.size / file.size : 1,
		};
	} catch (error) {
		console.error("Server image optimization failed:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
			url: "",
			size: 0,
			width: 0,
			height: 0,
			format: options.format,
		};
	}
};

/**
 * Check if the file is a HEIC/HEIF image
 * @param file The file to check
 * @returns True if the file is a HEIC image, false otherwise
 */
export const isHeicOrHeifImage = async (file: File): Promise<boolean> => {
	// Check mime type first
	if (file.type === "image/heic" || file.type === "image/heif") {
		return true;
	}

	// Check filename extension as fallback
	const fileName = file.name.toLowerCase();
	if (fileName.endsWith(".heic") || fileName.endsWith(".heif")) {
		return true;
	}

	return false;
};

export const convertHeicToJpeg = async (
	file: File,
	quality = DEFAULT_QUALITY,
): Promise<File> => {
	try {
		// Skip double-checking - we trust the caller to only send HEIC files
		// This prevents circular logic where we detect HEIC then fail on conversion

		// Read the file as ArrayBuffer
		const arrayBuffer = await file.arrayBuffer();

		// heic-convert/browser uses native browser capabilities for conversion
		// It takes an ArrayBuffer and returns a converted Buffer
		const jpegBuffer = await convert({
			buffer: new Uint8Array(arrayBuffer),
			format: "JPEG",
			quality: quality / 100,
		});

		// Convert the result to a Blob
		const jpeg = new Blob([jpegBuffer], { type: "image/jpeg" });

		// Validate that we actually got a result
		if (!jpeg || jpeg.size === 0) {
			throw new Error("HEIC conversion produced an empty file");
		}

		const originalNameWithoutExtension = file.name.replace(/\.[^/.]+$/, "");
		const newName = `${originalNameWithoutExtension}.jpg`;

		return new File([jpeg], newName, { type: "image/jpeg" });
	} catch (error) {
		console.error("HEIC conversion failed:", error);
		throw error;
	}
};

/**
 * Checks if a file is an AVIF image
 * @param file The file to check
 * @returns True if the file is an AVIF image
 */
export const isAvifImage = (file: File): boolean => {
	// Check MIME type first
	if (file.type === "image/avif") {
		return true;
	}

	// Check filename extension as fallback
	const fileName = file.name.toLowerCase();
	return fileName.endsWith(".avif");
};

/**
 * Convert AVIF image to WebP format on the client side
 * This helps handle problematic AVIF files before sending to the server
 * @param file The AVIF file to convert
 * @param quality Quality of the output WebP (1-100)
 * @returns A Promise that resolves to a File object in WebP format
 */
export const convertAvifToWebP = async (
	file: File,
	quality = DEFAULT_QUALITY,
): Promise<File> => {
	try {
		console.log(`Starting AVIF to WebP conversion, file size: ${file.size}`);

		// First attempt: Use canvas approach (works in most browsers that support AVIF)
		try {
			// Create an Image element to decode the AVIF
			const img = document.createElement("img");
			const url = URL.createObjectURL(file);

			console.log("Loading AVIF into Image element");
			// Load the image and wait for it to be loaded (with timeout)
			await Promise.race([
				new Promise((resolve, reject) => {
					img.onload = resolve;
					img.onerror = () => reject(new Error("Failed to load AVIF image"));
					img.src = url;
				}),
				new Promise((_, reject) =>
					setTimeout(
						() => reject(new Error("AVIF image loading timed out")),
						5000,
					),
				),
			]);

			console.log("Creating canvas for AVIF to WebP conversion");
			// Create a canvas and draw the image
			const canvas = document.createElement("canvas");
			canvas.width = img.width;
			canvas.height = img.height;
			const ctx = canvas.getContext("2d");
			if (!ctx) throw new Error("Could not get canvas context");
			ctx.drawImage(img, 0, 0);

			console.log("Converting canvas to WebP blob");
			// Convert to WebP
			const webpBlob = await new Promise<Blob>((resolve, reject) => {
				canvas.toBlob(
					(blob) => {
						if (blob) resolve(blob);
						else reject(new Error("Failed to convert to WebP"));
					},
					"image/webp",
					quality / 100,
				);
			});

			// Clean up
			URL.revokeObjectURL(url);

			console.log(`WebP conversion successful, new size: ${webpBlob.size}`);

			// Create a new File with WebP extension
			const originalNameWithoutExtension = file.name.replace(/\.[^/.]+$/, "");
			const newName = `${originalNameWithoutExtension}.webp`;

			return new File([webpBlob], newName, { type: "image/webp" });
		} catch (canvasError) {
			console.error("Canvas approach failed:", canvasError);

			// If canvas approach fails, convert to JPEG as intermediate (always reliable)
			console.log("Trying fallback approach - converting to JPEG first");

			// Use in-memory conversion to JPEG first
			// This requires implementing a more complex approach with offscreen canvas or
			// web workers, which is beyond the scope of this example
			throw new Error(
				"Canvas approach failed - need to convert to JPEG first on the server",
			);
		}
	} catch (error) {
		console.error("AVIF to WebP conversion failed:", error);
		throw error;
	}
};
