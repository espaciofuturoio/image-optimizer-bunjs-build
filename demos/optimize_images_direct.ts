import { optimizeImage } from "../src/features/images/image_optimizer";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

interface OptimizationResult {
	imageUrl: string;
	originalSize: number;
	optimizedSize: number;
	processingTime: number;
	compressionRatio: number;
	success: boolean;
	error?: string;
	outputPath?: string;
}

async function optimizeImageDirect(
	imageUrl: string,
	options: {
		format?: "webp" | "avif" | "jpeg" | "png";
		quality?: number;
		width?: number;
		outputDir?: string;
	} = {},
): Promise<OptimizationResult> {
	try {
		console.log(`\nProcessing image: ${imageUrl}`);

		// Get original image size
		let buffer: ArrayBuffer;
		if (imageUrl.startsWith("http")) {
			// Handle remote images
			const response = await fetch(imageUrl);
			buffer = await response.arrayBuffer();
		} else {
			// Handle local images
			const file = Bun.file(imageUrl);
			buffer = await file.arrayBuffer();
		}

		const originalSize = buffer.byteLength;
		console.log(`Original size: ${(originalSize / 1024).toFixed(2)}KB`);

		// Optimize image
		console.log("\nOptimizing image...");
		const start = performance.now();
		const result = await optimizeImage(buffer, {
			format: options.format || "webp",
			quality: options.quality || 75,
			width: options.width || 1200,
			sourceFormat: "webp",
			outputDir: options.outputDir || "tmp/optimized",
			baseUrl: "http://localhost:3000",
		});
		const end = performance.now();

		const processingTime = end - start;
		console.log(`Optimized size: ${(result.size / 1024).toFixed(2)}KB`);
		console.log(`Processing time: ${processingTime.toFixed(2)}ms`);

		return {
			imageUrl,
			originalSize,
			optimizedSize: result.size,
			processingTime,
			compressionRatio: (result.size / originalSize) * 100,
			success: true,
			outputPath: result.path,
		};
	} catch (error) {
		console.error(`\nError processing image ${imageUrl}:`);
		console.error(error instanceof Error ? error.stack : error);

		return {
			imageUrl,
			originalSize: 0,
			optimizedSize: 0,
			processingTime: 0,
			compressionRatio: 0,
			success: false,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
}

async function main() {
	// Parse command line arguments
	const args = process.argv.slice(2);
	const urlIndex = args.indexOf("--url");
	const formatIndex = args.indexOf("--format");
	const qualityIndex = args.indexOf("--quality");
	const widthIndex = args.indexOf("--width");
	const outputIndex = args.indexOf("--output");

	// Default options
	const options: {
		format: "webp" | "avif" | "jpeg" | "png";
		quality: number;
		width: number;
		outputDir: string;
	} = {
		format: "webp",
		quality: 75,
		width: 1200,
		outputDir: "tmp/optimized",
	};

	// Update options from command line arguments
	if (formatIndex !== -1) {
		const format = args[formatIndex + 1];
		if (["webp", "avif", "jpeg", "png"].includes(format)) {
			options.format = format as "webp" | "avif" | "jpeg" | "png";
		}
	}
	if (qualityIndex !== -1) {
		const quality = Number.parseInt(args[qualityIndex + 1], 10);
		if (!Number.isNaN(quality) && quality > 0 && quality <= 100) {
			options.quality = quality;
		}
	}
	if (widthIndex !== -1) {
		const width = Number.parseInt(args[widthIndex + 1], 10);
		if (!Number.isNaN(width) && width > 0) {
			options.width = width;
		}
	}
	if (outputIndex !== -1) {
		options.outputDir = args[outputIndex + 1];
	}

	// Create output directory
	mkdirSync(options.outputDir, { recursive: true });

	// Process single image if URL is provided
	if (urlIndex !== -1) {
		const imageUrl = args[urlIndex + 1];
		if (!imageUrl) {
			console.error("Missing image URL");
			process.exit(1);
		}

		const result = await optimizeImageDirect(imageUrl, options);

		// Save result
		const output = {
			options,
			result,
		};

		writeFileSync(
			join(options.outputDir, "optimization_result.json"),
			JSON.stringify(output, null, 2),
		);

		// Log summary
		console.log("\nOptimization Summary:");
		console.log(`Original size: ${(result.originalSize / 1024).toFixed(2)}KB`);
		console.log(
			`Optimized size: ${(result.optimizedSize / 1024).toFixed(2)}KB`,
		);
		console.log(`Compression ratio: ${result.compressionRatio.toFixed(2)}%`);
		console.log(`Processing time: ${result.processingTime.toFixed(2)}ms`);
		if (result.outputPath) {
			console.log(`Output path: ${result.outputPath}`);
		}
	} else {
		// Process all images from properties.json
		const properties = JSON.parse(readFileSync("properties.json", "utf-8"));
		console.log(`Processing ${properties.length} properties...`);

		const results: OptimizationResult[] = [];
		let totalImages = 0;

		for (const property of properties) {
			console.log(`\nProcessing property: ${property.id}`);

			// Optimize cover image
			const coverResult = await optimizeImageDirect(
				property.imageCoverPreviewUrl,
				options,
			);
			results.push(coverResult);
			totalImages++;

			// Optimize gallery images
			for (const galleryUrl of property.galleryImages) {
				const galleryResult = await optimizeImageDirect(galleryUrl, options);
				results.push(galleryResult);
				totalImages++;
			}
		}

		// Calculate averages
		const successfulResults = results.filter((r) => r.success);
		const averages = {
			totalImages,
			successfulImages: successfulResults.length,
			failedImages: results.length - successfulResults.length,
			averageOriginalSize:
				successfulResults.reduce((sum, r) => sum + r.originalSize, 0) /
				successfulResults.length,
			averageOptimizedSize:
				successfulResults.reduce((sum, r) => sum + r.optimizedSize, 0) /
				successfulResults.length,
			averageProcessingTime:
				successfulResults.reduce((sum, r) => sum + r.processingTime, 0) /
				successfulResults.length,
			averageCompressionRatio:
				successfulResults.reduce((sum, r) => sum + r.compressionRatio, 0) /
				successfulResults.length,
		};

		// Save results
		const output = {
			options,
			individualResults: results,
			averages,
		};

		writeFileSync(
			join(options.outputDir, "optimization_results.json"),
			JSON.stringify(output, null, 2),
		);

		// Log summary
		console.log("\nOptimization Summary:");
		console.log(`Total images processed: ${totalImages}`);
		console.log(`Successfully processed: ${successfulResults.length}`);
		console.log(
			`Failed to process: ${results.length - successfulResults.length}`,
		);
		console.log("\nAverage Results:");
		console.log(
			`Original size: ${(averages.averageOriginalSize / 1024).toFixed(2)}KB`,
		);
		console.log(
			`Optimized size: ${(averages.averageOptimizedSize / 1024).toFixed(2)}KB`,
		);
		console.log(
			`Average compression ratio: ${averages.averageCompressionRatio.toFixed(2)}%`,
		);
		console.log(
			`Average processing time: ${averages.averageProcessingTime.toFixed(2)}ms`,
		);
	}
}

// Set a timeout for the entire operation
const timeout = setTimeout(
	() => {
		console.error("Operation timed out after 10 minutes");
		process.exit(1);
	},
	10 * 60 * 1000,
);

main()
	.then(() => {
		clearTimeout(timeout);
		process.exit(0);
	})
	.catch((error) => {
		clearTimeout(timeout);
		console.error("Error:", error);
		process.exit(1);
	});
