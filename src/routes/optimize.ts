import { optimizeImage } from "../features/image_optimizer";
import { join } from "node:path";
import type { Format } from "../types";
import { PUBLIC_SERVER_URL } from "@/constants";
import { ENV } from "@/env";
const allowedMimeTypes = [
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/avif",
];

export const handleUploadOptimize = async (req: Request) => {
	try {
		// Parse the form data
		const formData = await req.formData();
		const file = formData.get("file") as File;

		if (!file) {
			throw new Error("No file provided");
		}

		// Check file size
		const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
		if (file.size > MAX_FILE_SIZE) {
			throw new Error(
				`File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
			);
		}

		if (!allowedMimeTypes.includes(file.type)) {
			throw new Error(
				`Unsupported file type: ${file.type}. Supported types: ${allowedMimeTypes.join(
					", ",
				)}`,
			);
		}

		// Get optimization options from form data
		const format = (formData.get("format") as Format) || "webp";

		// Parse and validate quality (1-100)
		const qualityStr = formData.get("quality") as string;
		const quality = qualityStr
			? Math.min(Math.max(Number.parseInt(qualityStr) || 80, 1), 100)
			: 80;

		// Parse and validate dimensions
		const widthStr = formData.get("width") as string;
		const width = widthStr ? Number.parseInt(widthStr) : undefined;
		if (width !== undefined && (Number.isNaN(width) || width <= 0)) {
			throw new Error("Width must be a positive number");
		}
		const heightStr = formData.get("height") as string;
		const height = heightStr ? Number.parseInt(heightStr) : undefined;
		if (height !== undefined && (Number.isNaN(height) || height <= 0)) {
			throw new Error("Height must be a positive number");
		}

		// Read the file as ArrayBuffer
		const buffer = await file.arrayBuffer();

		// Get file extension to determine source format
		const sourceFormat = file.name.split(".").pop()?.toLowerCase() || "unknown";

		// Optimize the image
		const result = await optimizeImage(buffer, {
			format,
			quality,
			width,
			height,
			sourceFormat,
			outputDir: join(process.cwd(), ENV.UPLOAD_DIR),
			baseUrl: ENV.PUBLIC_SERVER_URL,
		});

		return {
			success: true,
			message: "Image optimized and uploaded successfully",
			result: {
				id: result.id,
				format: result.format,
				size: result.size,
				width: result.width,
				height: result.height,
				url: result.url,
			},
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		throw new Error(`Failed to process image: ${errorMessage}`);
	}
};
