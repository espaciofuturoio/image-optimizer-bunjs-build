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
const TMP_IMAGES_DIR = "./tmp/images";
await mkdir(TMP_IMAGES_DIR, { recursive: true });

const getThumbnailImageConfig = {
	quality: 100,
	maxWidth: 200,
	maxSizeMB: 1,
};

const getFullImageConfig = {
	quality: 75,
	maxWidth: 1200,
	maxSizeMB: 1,
};

const previewImageConfig = {
	quality: 75,
	maxWidth: 720,
	maxSizeMB: 1,
};

interface OptimizedImage {
	url: string;
}

async function createOptimizedImages(
	imagePath: string,
	configs: Record<string, typeof getFullImageConfig>,
): Promise<Record<string, OptimizedImage>> {
	const results: Record<string, OptimizedImage> = {};

	for (const [type, config] of Object.entries(configs)) {
		const optimizedImage = await optimizeImageWithPlaywright(imagePath, {
			format: "webp",
			...config,
		});

		if (!optimizedImage.success) {
			throw new Error(
				`Failed to optimize ${type} image: ${optimizedImage.error}`,
			);
		}

		const tempFilePath = await imageService.saveOptimizedImage(
			optimizedImage.url,
			TMP_IMAGES_DIR,
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

		results[type] = { url };
		console.log(`\n${type} image uploaded URL:`, url);

		// Clean up the temporary file
		await Bun.write(tempFilePath, "");
	}

	return results;
}

(async () => {
	try {
		const imagePath =
			"/Users/ruben/Documents/projects/espaciofuturoio/image-optimizer-bunjs-build/src/image.jpeg";

		const configs = {
			thumbnail: getThumbnailImageConfig,
			full: getFullImageConfig,
			preview: previewImageConfig,
		};

		const optimizedImages = await createOptimizedImages(imagePath, configs);
		console.log("\nFinal URLs:", optimizedImages);
	} catch (error) {
		console.error("Failed to process images:", error);
	}
})();
