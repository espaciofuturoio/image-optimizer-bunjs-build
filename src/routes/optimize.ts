import { ENV } from "@/env";
import { optimizeImage } from "../features/image_optimizer";
import { join } from "node:path";

export const handleUploadOptimize = async (req: Request) => {
	try {
		// Parse the form data
		const formData = await req.formData();
		const file = formData.get("file") as File;

		if (!file) {
			throw new Error("No file provided");
		}

		// Get optimization options from form data
		const format =
			(formData.get("format") as "webp" | "avif" | "jpeg" | "png") || "webp";
		const quality = Number.parseInt(formData.get("quality") as string) || 80;
		const width = Number.parseInt(formData.get("width") as string) || undefined;
		const height =
			Number.parseInt(formData.get("height") as string) || undefined;

		// Read the file as ArrayBuffer
		const buffer = await file.arrayBuffer();

		// Get file extension to determine source format
		const sourceFormat = file.name.split(".").pop()?.toLowerCase() || "unknown";

		// Define output directory and public URL
		const outputDir = join(process.cwd(), "uploads");

		// Optimize the image
		const result = await optimizeImage(buffer, {
			format,
			quality,
			width,
			height,
			sourceFormat,
			outputDir,
		});

		return {
			success: true,
			message: "Image optimized and uploaded successfully",
			result,
		};
	} catch (error) {
		console.error("Error processing image:", error);
		throw new Error(`Failed to process image: ${error}`);
	}
};
