import { createImageService } from "./google_cdn";
import dotenv from "dotenv";
import { optimizeImageWithPlaywright } from "./playwright_optimizer";
import type { OptimizedImageResult } from "@/features/images/image_compression_util";
import { mkdir } from "node:fs/promises";

dotenv.config();

const imageService = createImageService(
	{
		keyFilePath: process.env.GOOGLE_CLOUD_KEY_FILE_PATH || "",
	},
	process.env.GOOGLE_CLOUD_BUCKET_NAME || "tinypic",
);

// Ensure tmp/images directory exists
const TMP_PRE_PROCESSED_IMAGES_DIR = "./tmp/pre-processed-images";
const TMP_INPUT_IMAGES_DIR = "./tmp/input-images";
await mkdir(TMP_PRE_PROCESSED_IMAGES_DIR, { recursive: true });
await mkdir(TMP_INPUT_IMAGES_DIR, { recursive: true });
type ImageType = "thumbnail" | "full" | "preview";

interface ImageConfig {
	quality: number;
	maxWidth: number;
	maxSizeMB: number;
}

const imageConfigs: Record<ImageType, ImageConfig> = {
	thumbnail: {
		quality: 100,
		maxWidth: 200,
		maxSizeMB: 1,
	},
	full: {
		quality: 75,
		maxWidth: 1200,
		maxSizeMB: 1,
	},
	preview: {
		quality: 75,
		maxWidth: 720,
		maxSizeMB: 1,
	},
};

interface OptimizedImage {
	url: string;
	originalUrl: string;
	isRemote: boolean;
}

interface FetchTimeResult {
	type: ImageType;
	originalFetchTimeMs: number;
	optimizedFetchTimeMs: number;
	improvement: number;
}

async function measureFetchTime(url: string): Promise<number> {
	const start = performance.now();
	const response = await fetch(url);
	const buffer = await response.arrayBuffer();
	const end = performance.now();
	return end - start;
}

async function measureOptimizedImagesFetchTimes(
	results: Record<ImageType, OptimizedImage>,
): Promise<FetchTimeResult[]> {
	const fetchTimes: FetchTimeResult[] = [];

	for (const [type, result] of Object.entries(results)) {
		if (result.isRemote) {
			console.log(`\nMeasuring ${type} image:`);

			// Measure original image fetch time
			const originalFetchTimeMs = await measureFetchTime(result.originalUrl);
			console.log(`Original: ${originalFetchTimeMs.toFixed(2)}ms`);

			// Measure optimized image fetch time
			const optimizedFetchTimeMs = await measureFetchTime(result.url);
			console.log(`Optimized: ${optimizedFetchTimeMs.toFixed(2)}ms`);

			// Calculate improvement percentage
			const improvement =
				((originalFetchTimeMs - optimizedFetchTimeMs) / originalFetchTimeMs) *
				100;

			fetchTimes.push({
				type: type as ImageType,
				originalFetchTimeMs,
				optimizedFetchTimeMs,
				improvement,
			});
		}
	}

	return fetchTimes;
}

const createOptimizedImages = async (
	source: string,
	types: ImageType[],
): Promise<Record<ImageType, OptimizedImage>> => {
	const results: Record<ImageType, OptimizedImage> = {} as Record<
		ImageType,
		OptimizedImage
	>;
	const isRemote = source.startsWith("http");

	// Download or get the source image
	const imagePath = isRemote
		? await imageService.saveToLocalImage(source, TMP_INPUT_IMAGES_DIR)
		: source;

	try {
		for (const type of types) {
			const config = imageConfigs[type];
			const optimizedImage = await optimizeImageWithPlaywright(imagePath, {
				format: "webp",
				...config,
			});

			if (!optimizedImage.success) {
				throw new Error(
					`Failed to optimize ${type} image: ${optimizedImage.error}`,
				);
			}

			const tempFilePath = await imageService.saveToLocalImage(
				optimizedImage.url,
				TMP_PRE_PROCESSED_IMAGES_DIR,
			);

			// Upload the optimized image to Google Cloud Storage with real estate specific metadata
			const url = await imageService.uploadImage(
				tempFilePath,
				`rubenabix/${type}`,
				{
					cacheControl: "public, max-age=31536000, immutable, must-revalidate",
					contentType: "image/webp",
					metadata: {
						propertyId: "PROP123",
						roomType: "living-room",
						imageType: type,
						optimized: "true",
						uploadedBy: "real-estate-app",
					},
				},
			);

			results[type] = {
				url,
				originalUrl: source,
				isRemote,
			};
			console.log(`\n${type} image uploaded URL:`, url);

			// Clean up the temporary file
			await Bun.write(tempFilePath, "");
		}

		return results;
	} finally {
		// Clean up the source image if it was downloaded
		if (isRemote) {
			await Bun.write(imagePath, "");
		}
	}
};

(async () => {
	try {
		// Example with remote URL
		const remoteImageUrl =
			"https://image.wasi.co/eyJidWNrZXQiOiJzdGF0aWN3Iiwia2V5IjoiaW5tdWVibGVzXC9nMTA0MTIzMTIwMjMwMTA0MDI1NDA3LmpwZWciLCJlZGl0cyI6eyJub3JtYWxpc2UiOnRydWUsInJvdGF0ZSI6MCwicmVzaXplIjp7IndpZHRoIjo5MDAsImhlaWdodCI6Njc1LCJmaXQiOiJjb250YWluIiwiYmFja2dyb3VuZCI6eyJyIjoyNTUsImciOjI1NSwiYiI6MjU1LCJhbHBoYSI6MX19fX0=";

		// Specify which types of images you want to generate
		const typesToGenerate: ImageType[] = ["thumbnail", "full", "preview"];

		// Process remote image
		console.log("\nProcessing remote image...");
		const remoteResults = await createOptimizedImages(
			remoteImageUrl,
			typesToGenerate,
		);
		console.log("\nRemote image URLs:", remoteResults);

		// Optionally measure fetch times for remote images
		const shouldMeasureFetchTimes = true; // Can be made configurable
		if (shouldMeasureFetchTimes && remoteResults.thumbnail.isRemote) {
			console.log("\nMeasuring fetch times for remote images...");
			const fetchTimes = await measureOptimizedImagesFetchTimes(remoteResults);

			console.log("\nFetch time comparison:");
			for (const {
				type,
				originalFetchTimeMs,
				optimizedFetchTimeMs,
				improvement,
			} of fetchTimes) {
				console.log(`\n${type}:`);
				console.log(`  Original:  ${originalFetchTimeMs.toFixed(2)}ms`);
				console.log(`  Optimized: ${optimizedFetchTimeMs.toFixed(2)}ms`);
				console.log(`  Improvement: ${improvement.toFixed(1)}%`);
			}
		}
	} catch (error) {
		console.error("Failed to process images:", error);
	}
})();
