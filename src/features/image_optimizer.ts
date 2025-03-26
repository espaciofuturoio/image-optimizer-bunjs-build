import sharp from "sharp";
import * as fs from "node:fs";
import { join } from "node:path";
import { nanoid } from "nanoid";
import { ENV } from "@/env";

export interface ImageOptimizationOptions {
	format?: "webp" | "avif" | "jpeg" | "png";
	quality?: number;
	width?: number;
	height?: number;
	sourceFormat?: string;
	outputDir: string;
	baseUrl: string;
}

export interface OptimizedImageResult {
	id: string;
	format: string;
	size: number;
	width: number;
	height: number;
	url: string;
	path: string;
	success: boolean;
}

export const optimizeImage = async (
	buffer: ArrayBuffer,
	options: ImageOptimizationOptions,
): Promise<OptimizedImageResult> => {
	const {
		format = "webp",
		quality = 80,
		width,
		height,
		sourceFormat = "unknown",
		outputDir,
		baseUrl,
	} = options;

	// Generate unique ID for the file
	const fileId = nanoid();
	const outputFormat = ["webp", "avif", "jpeg", "png"].includes(format)
		? format
		: "webp";
	const filename = `${fileId}.${outputFormat}`;
	const outputPath = join(outputDir, filename);

	console.log(
		`Processing image: sourceFormat=${sourceFormat}, targetFormat=${outputFormat}, size=${buffer.byteLength}`,
	);

	// Process image with sharp
	let sharpInstance = sharp(Buffer.from(buffer));

	// Get initial metadata to help with debugging
	try {
		const inputMetadata = await sharpInstance.metadata();
		console.log(
			"Input image metadata:",
			JSON.stringify({
				format: inputMetadata.format,
				width: inputMetadata.width,
				height: inputMetadata.height,
				space: inputMetadata.space,
				channels: inputMetadata.channels,
			}),
		);
	} catch (metaErr) {
		console.warn("Could not read input metadata:", metaErr);
	}

	// Keep original buffer for recovery
	const originalBuffer = Buffer.from(buffer);

	// AVIF can be problematic in Sharp - for all AVIF source files, decode through JPEG first
	if (sourceFormat === "avif") {
		try {
			console.log(
				"Processing AVIF through intermediate JPEG for better compatibility",
			);
			console.log(`Original requested output format is: ${outputFormat}`);

			// Try a different approach using temporary files for more reliable processing
			const tempJpegPath = join(outputDir, `${fileId}_temp.jpg`);

			try {
				// Save to a temporary JPEG file first
				await sharp(originalBuffer).jpeg({ quality: 90 }).toFile(tempJpegPath);

				// Create new sharp instance from the JPEG file
				sharpInstance = sharp(tempJpegPath);
				console.log(
					"AVIF intermediate conversion through temp file successful",
				);
			} catch (tempFileErr) {
				console.error("Temp file approach failed:", tempFileErr);

				// Fall back to in-memory conversion
				const jpegBuffer = await sharp(originalBuffer)
					.jpeg({ quality: 90 })
					.toBuffer();
				sharpInstance = sharp(jpegBuffer);
				console.log("AVIF intermediate conversion through memory successful");
			} finally {
				// Clean up temp file if it exists
				try {
					if (fs.existsSync(tempJpegPath)) {
						fs.unlinkSync(tempJpegPath);
					}
				} catch (cleanupErr) {
					console.warn("Failed to clean up temp file:", cleanupErr);
				}
			}

			console.log(
				`Successfully decoded AVIF through JPEG, will now convert to final format: ${outputFormat}`,
			);
		} catch (avifErr) {
			console.error("All AVIF intermediate conversions failed:", avifErr);
			// Continue with original approach as last resort
		}
	}

	// Resize if dimensions provided
	if (width || height) {
		sharpInstance = sharpInstance.resize({
			width: width || undefined,
			height: height || undefined,
			fit: "inside",
			withoutEnlargement: true,
		});
	}

	// Format conversion and compression
	switch (outputFormat) {
		case "webp":
			console.log(`Applying WebP conversion with quality: ${quality}`);
			sharpInstance = sharpInstance.webp({ quality });
			break;
		case "avif":
			console.log(`Applying AVIF conversion with quality: ${quality}`);
			sharpInstance = sharpInstance.avif({
				quality,
				effort: 4,
				chromaSubsampling: "4:2:0",
			});
			break;
		case "jpeg":
			console.log(`Applying JPEG conversion with quality: ${quality}`);
			sharpInstance = sharpInstance.jpeg({ quality });
			break;
		case "png":
			console.log(`Applying PNG conversion with quality: ${quality}`);
			sharpInstance = sharpInstance.png({ quality });
			break;
	}

	// Process the image and get the buffer
	try {
		console.log(
			`Applying final format conversion to: ${outputFormat} with quality: ${quality}`,
		);
		const outputBuffer = await sharpInstance.toBuffer();
		console.log(
			`Format conversion successful, buffer size: ${outputBuffer.length}`,
		);

		// Ensure output directory exists
		if (!fs.existsSync(outputDir)) {
			fs.mkdirSync(outputDir, { recursive: true });
		}

		// Write file using the fs module directly
		fs.writeFileSync(outputPath, new Uint8Array(outputBuffer));
		console.log(`File written successfully to ${outputPath}`);

		// Get image metadata
		const metadata = await sharp(outputBuffer).metadata();
		console.log(
			`Output metadata: ${JSON.stringify({
				format: metadata.format,
				width: metadata.width,
				height: metadata.height,
			})}`,
		);

		if (!metadata.width || !metadata.height) {
			throw new Error("Failed to get image dimensions from metadata");
		}

		console.log(
			`Image processed successfully: id=${fileId}, format=${outputFormat}, size=${outputBuffer.length}`,
		);

		return {
			id: fileId,
			format: outputFormat,
			size: outputBuffer.length,
			width: metadata.width,
			height: metadata.height,
			url: `${baseUrl}/${process.env.UPLOAD_DIR}/${filename}`,
			path: outputPath,
			success: true,
		};
	} catch (processError) {
		console.error("Error during final image processing:", processError);
		throw new Error(`Image processing failed: ${String(processError)}`);
	}
};
