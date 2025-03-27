import { createOptimizedImages } from "../src/utils/optimizer";
import { optimizeImage } from "../src/features/images/image_optimizer";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

interface Property {
	id: string;
	title: string;
	price: number;
	location: string;
	imageCoverPreviewUrl: string;
	galleryImages: string[];
	details: {
		bedrooms: number;
		bathrooms: number;
		area: number;
		landSize: number;
		propertyType: string;
		contact: {
			name: string;
			phone: string;
			email: string;
		};
	};
	geolocation: {
		lat: number;
		lng: number;
	};
	description: {
		es: string;
		en: string;
	};
}

interface OptimizationComparison {
	propertyId: string;
	imageUrl: string;
	originalSize: number;
	playwrightOptimizedSize: number;
	directOptimizedSize: number;
	playwrightProcessingTime: number;
	directProcessingTime: number;
	playwrightCompressionRatio: number;
	directCompressionRatio: number;
	success: boolean;
	error?: string;
}

async function compareOptimizationMethods(
	propertyId: string,
	imageUrl: string,
): Promise<OptimizationComparison> {
	try {
		console.log(`\nProcessing image: ${imageUrl}`);

		// Get original image size
		let originalSize: number;
		let buffer: ArrayBuffer;

		if (imageUrl.startsWith("http")) {
			// Handle remote images
			const response = await fetch(imageUrl);
			buffer = await response.arrayBuffer();
			originalSize = buffer.byteLength;
		} else {
			// Handle local images
			const file = Bun.file(imageUrl);
			buffer = await file.arrayBuffer();
			originalSize = buffer.byteLength;
		}

		console.log(`Original size: ${(originalSize / 1024).toFixed(2)}KB`);

		// Measure Playwright optimization
		console.log("\nTesting Playwright optimization...");
		const playwrightStart = performance.now();
		const playwrightResult = await createOptimizedImages(imageUrl, ["full"]);
		const playwrightEnd = performance.now();

		// Get the optimized image size from the CDN
		const playwrightResponse = await fetch(playwrightResult.full.url);
		const playwrightBuffer = await playwrightResponse.arrayBuffer();
		const playwrightOptimizedSize = playwrightBuffer.byteLength;

		const playwrightProcessingTime = playwrightEnd - playwrightStart;
		console.log(
			`Playwright optimized size: ${(playwrightOptimizedSize / 1024).toFixed(2)}KB`,
		);
		console.log(
			`Playwright processing time: ${playwrightProcessingTime.toFixed(2)}ms`,
		);

		// Measure direct optimization
		console.log("\nTesting direct optimization...");
		const directStart = performance.now();
		const directResult = await optimizeImage(buffer, {
			format: "webp",
			quality: 75,
			width: 1200,
			sourceFormat: "webp",
			outputDir: "tmp/direct-optimized",
			baseUrl: "http://localhost:3000",
		});
		const directEnd = performance.now();
		const directOptimizedSize = directResult.size;
		const directProcessingTime = directEnd - directStart;
		console.log(
			`Direct optimized size: ${(directOptimizedSize / 1024).toFixed(2)}KB`,
		);
		console.log(`Direct processing time: ${directProcessingTime.toFixed(2)}ms`);

		return {
			propertyId,
			imageUrl,
			originalSize,
			playwrightOptimizedSize,
			directOptimizedSize,
			playwrightProcessingTime,
			directProcessingTime,
			playwrightCompressionRatio:
				(playwrightOptimizedSize / originalSize) * 100,
			directCompressionRatio: (directOptimizedSize / originalSize) * 100,
			success: true,
		};
	} catch (error) {
		console.error(`\nError processing image ${imageUrl}:`);
		console.error(error instanceof Error ? error.stack : error);

		return {
			propertyId,
			imageUrl,
			originalSize: 0,
			playwrightOptimizedSize: 0,
			directOptimizedSize: 0,
			playwrightProcessingTime: 0,
			directProcessingTime: 0,
			playwrightCompressionRatio: 0,
			directCompressionRatio: 0,
			success: false,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
}

async function main() {
	// Create comparison directory if it doesn't exist
	const comparisonDir = "comparison";
	mkdirSync(comparisonDir, { recursive: true });

	// Create directory for direct optimization output
	mkdirSync("tmp/direct-optimized", { recursive: true });

	// Read properties
	const properties: Property[] = JSON.parse(
		readFileSync("properties.json", "utf-8"),
	);

	console.log(`Starting comparison for ${properties.length} properties...`);

	const results: OptimizationComparison[] = [];
	let totalImages = 0;

	// Process each property
	for (const property of properties) {
		console.log(`Processing property: ${property.id}`);

		// Compare cover image
		const coverResult = await compareOptimizationMethods(
			property.id,
			property.imageCoverPreviewUrl,
		);
		results.push(coverResult);
		totalImages++;

		// Compare first 3 gallery images
		for (let i = 0; i < Math.min(3, property.galleryImages.length); i++) {
			const galleryResult = await compareOptimizationMethods(
				property.id,
				property.galleryImages[i],
			);
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
		averagePlaywrightSize:
			successfulResults.reduce((sum, r) => sum + r.playwrightOptimizedSize, 0) /
			successfulResults.length,
		averageDirectSize:
			successfulResults.reduce((sum, r) => sum + r.directOptimizedSize, 0) /
			successfulResults.length,
		averagePlaywrightTime:
			successfulResults.reduce(
				(sum, r) => sum + r.playwrightProcessingTime,
				0,
			) / successfulResults.length,
		averageDirectTime:
			successfulResults.reduce((sum, r) => sum + r.directProcessingTime, 0) /
			successfulResults.length,
		averagePlaywrightCompression:
			successfulResults.reduce(
				(sum, r) => sum + r.playwrightCompressionRatio,
				0,
			) / successfulResults.length,
		averageDirectCompression:
			successfulResults.reduce((sum, r) => sum + r.directCompressionRatio, 0) /
			successfulResults.length,
	};

	// Save results
	const output = {
		individualResults: results,
		averages,
	};

	writeFileSync(
		join(comparisonDir, "optimization_comparison.json"),
		JSON.stringify(output, null, 2),
	);

	// Log summary
	console.log("\nComparison Summary:");
	console.log(`Total images compared: ${totalImages}`);
	console.log(`Successfully processed: ${successfulResults.length}`);
	console.log(
		`Failed to process: ${results.length - successfulResults.length}`,
	);
	console.log("\nAverage Results:");
	console.log(
		`Original size: ${(averages.averageOriginalSize / 1024).toFixed(2)}KB`,
	);
	console.log(
		`Playwright optimized: ${(averages.averagePlaywrightSize / 1024).toFixed(2)}KB`,
	);
	console.log(
		`Direct optimized: ${(averages.averageDirectSize / 1024).toFixed(2)}KB`,
	);
	console.log(
		`Playwright processing time: ${averages.averagePlaywrightTime.toFixed(2)}ms`,
	);
	console.log(
		`Direct processing time: ${averages.averageDirectTime.toFixed(2)}ms`,
	);
	console.log(
		`Playwright compression ratio: ${averages.averagePlaywrightCompression.toFixed(2)}%`,
	);
	console.log(
		`Direct compression ratio: ${averages.averageDirectCompression.toFixed(2)}%`,
	);
}

// Set a timeout for the entire operation
const timeout = setTimeout(
	() => {
		console.error("Operation timed out after 10 hours");
		process.exit(1);
	},
	10 * 60 * 100 * 24 * 10,
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
