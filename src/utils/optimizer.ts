import { createImageService } from "./google_cdn";
import dotenv from "dotenv";
import { optimizeImageWithPlaywright } from "./playwright_optimizer";
import type { OptimizedImageResult } from "@/features/images/image_compression_util";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

// Load environment variables from the root .env file
const rootEnvPath = join(process.cwd(), ".env");
dotenv.config({ path: rootEnvPath });

// Set the server URL for local development
process.env.PUBLIC_SERVER_URL = "http://localhost:3000";

// Validate required environment variables
if (!process.env.CDN_BASE_URL) {
	console.error("Error: CDN_BASE_URL environment variable is not set.");
	console.error("Please run the setup script first:");
	console.error("  ./validate-bucket.sh reality_one_v2");
	process.exit(1);
}

// Extend the OptimizedImageResult type to include hash
interface ExtendedOptimizedImageResult extends OptimizedImageResult {
	hash: string;
}

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
export type ImageType = "thumbnail" | "full" | "preview";

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
	originalSizeKB: number;
	optimizedSizeKB: number;
	timeImprovement: number;
	sizeReduction: number;
}

async function measureResponseStats(
	url: string,
): Promise<{ timeMs: number; sizeKB: number }> {
	const start = performance.now();
	let retries = 3;
	let lastError: Error | null = null;

	while (retries > 0) {
		try {
			const response = await fetch(url, {
				headers: {
					Accept: "image/webp,image/*,*/*;q=0.8",
					"Cache-Control": "no-cache",
				},
			});

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const buffer = await response.arrayBuffer();
			const end = performance.now();
			const sizeKB = buffer.byteLength / 1024;

			return {
				timeMs: end - start,
				sizeKB,
			};
		} catch (error) {
			lastError = error as Error;
			console.warn(`Attempt ${4 - retries} failed:`, error);
			retries--;

			if (retries > 0) {
				// Exponential backoff
				await new Promise((resolve) =>
					setTimeout(resolve, 2 ** (4 - retries) * 1000),
				);
			}
		}
	}

	throw new Error(
		`Failed to fetch image after 3 attempts. Last error: ${lastError?.message}`,
	);
}

export const measureOptimizedImagesFetchTimes = async (
	results: Record<ImageType, OptimizedImage>,
): Promise<FetchTimeResult[]> => {
	const fetchTimes: FetchTimeResult[] = [];

	for (const [type, result] of Object.entries(results)) {
		if (result.isRemote) {
			console.log(`\nMeasuring ${type} image:`);

			// Measure original image stats
			const originalStats = await measureResponseStats(result.originalUrl);
			console.log(
				`Original: ${originalStats.timeMs.toFixed(2)}ms, ${originalStats.sizeKB.toFixed(1)}KB`,
			);

			// Measure optimized image stats
			const optimizedStats = await measureResponseStats(result.url);
			console.log(
				`Optimized: ${optimizedStats.timeMs.toFixed(2)}ms, ${optimizedStats.sizeKB.toFixed(1)}KB`,
			);

			// Calculate improvements
			const timeImprovement =
				((originalStats.timeMs - optimizedStats.timeMs) /
					originalStats.timeMs) *
				100;
			const sizeReduction =
				((originalStats.sizeKB - optimizedStats.sizeKB) /
					originalStats.sizeKB) *
				100;

			fetchTimes.push({
				type: type as ImageType,
				originalFetchTimeMs: originalStats.timeMs,
				optimizedFetchTimeMs: optimizedStats.timeMs,
				originalSizeKB: originalStats.sizeKB,
				optimizedSizeKB: optimizedStats.sizeKB,
				timeImprovement,
				sizeReduction,
			});
		}
	}

	return fetchTimes;
};

interface OptimizedImageWithConfig extends OptimizedImageResult {
	type: ImageType;
	config: ImageConfig;
	tempFilePath: string;
}

const optimizeImages = async (
	source: string,
	types: ImageType[],
): Promise<OptimizedImageWithConfig[]> => {
	const isRemote = source.startsWith("http");
	const tempFiles: string[] = [];

	try {
		// Download or get the source image
		const imagePath = isRemote
			? await imageService.saveToLocalImage(source, TMP_INPUT_IMAGES_DIR)
			: source;
		if (!imagePath) {
			throw new Error("Failed to get image path");
		}
		tempFiles.push(imagePath);

		// Log source image size
		const sourceFile = Bun.file(imagePath);
		const sourceSize = sourceFile.size;
		const sourceSizeKB = Math.round((sourceSize / 1024) * 100) / 100;
		console.log(`\nSource image size: ${sourceSizeKB}KB`);

		const optimizedImages: OptimizedImageWithConfig[] = [];

		for (const type of types) {
			const config = imageConfigs[type];
			console.log(`\nProcessing ${type} image with config:`, {
				quality: config.quality,
				maxWidth: config.maxWidth,
				maxSizeMB: config.maxSizeMB,
			});

			const optimizedImage = (await optimizeImageWithPlaywright(imagePath, {
				format: "webp",
				...config,
			})) as ExtendedOptimizedImageResult;

			if (!optimizedImage.success) {
				throw new Error(
					`Failed to optimize ${type} image: ${optimizedImage.error}`,
				);
			}

			const originalSizeKB = optimizedImage.originalSize
				? Math.round((optimizedImage.originalSize / 1024) * 100) / 100
				: "unknown";
			const optimizedSizeKB =
				Math.round((optimizedImage.size / 1024) * 100) / 100;
			const compressionRatio = optimizedImage.compressionRatio
				? Math.round(optimizedImage.compressionRatio * 100) / 100
				: "unknown";

			console.log("Optimized image stats:", {
				originalSize: `${originalSizeKB}KB`,
				optimizedSize: `${optimizedSizeKB}KB`,
				width: optimizedImage.width,
				height: optimizedImage.height,
				compressionRatio: `${compressionRatio}%`,
			});

			console.log("Optimized image URL:", optimizedImage.url);

			const tempFilePath = await imageService.saveToLocalImage(
				optimizedImage.url,
				TMP_PRE_PROCESSED_IMAGES_DIR,
			);
			if (!tempFilePath) {
				throw new Error("Failed to save optimized image");
			}
			tempFiles.push(tempFilePath);

			// Log temp file size before upload
			const tempFile = Bun.file(tempFilePath);
			const tempFileSize = tempFile.size;
			const tempFileSizeKB = Math.round((tempFileSize / 1024) * 100) / 100;
			console.log(`Temp file size before upload: ${tempFileSizeKB}KB`);

			optimizedImages.push({
				...optimizedImage,
				type,
				config,
				tempFilePath,
			});
		}

		return optimizedImages;
	} finally {
		// Clean up input image only, keep optimized images for upload
		if (isRemote && tempFiles[0]) {
			try {
				await Bun.write(tempFiles[0], "");
			} catch (error) {
				console.warn("Failed to clean up input file:", error);
			}
		}
	}
};

const uploadToCDN = async (
	optimizedImages: OptimizedImageWithConfig[],
	source: string,
): Promise<Record<ImageType, OptimizedImage>> => {
	const results: Record<ImageType, OptimizedImage> = {} as Record<
		ImageType,
		OptimizedImage
	>;
	const isRemote = source.startsWith("http");
	const tempFiles: string[] = [];

	try {
		for (const optimizedImage of optimizedImages) {
			const { type, config, tempFilePath } = optimizedImage;
			tempFiles.push(tempFilePath);

			// Upload the optimized image to Google Cloud Storage with real estate specific metadata
			const urls = await imageService.uploadImage(
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
						originalSize: optimizedImage.originalSize?.toString() || "unknown",
						optimizedSize: optimizedImage.size.toString(),
						compressionRatio:
							optimizedImage.compressionRatio?.toString() || "unknown",
						width: optimizedImage.width.toString(),
						height: optimizedImage.height.toString(),
						format: optimizedImage.format,
						quality: config.quality.toString(),
						maxWidth: config.maxWidth.toString(),
					},
				},
			);

			results[type] = {
				url: urls.directUrl,
				originalUrl: source,
				isRemote,
			};
			console.log(`\n${type} image URLs:`);
			console.log(`  Direct URL: ${urls.directUrl}`);
			console.log(`  CDN URL: ${urls.cdnUrl}`);
			console.log(`  GS URL: ${urls.gsUrl}`);
			console.log(`  Original URL: ${source}`);
		}

		return results;
	} finally {
		// Clean up all temporary files
		for (const file of tempFiles) {
			try {
				await Bun.write(file, "");
			} catch (error) {
				console.warn(`Failed to clean up temporary file ${file}:`, error);
			}
		}
	}
};

export const createOptimizedImages = async (
	source: string,
	types: ImageType[],
) => {
	// Step 1: Optimize images
	console.log("\nStep 1: Optimizing images...");
	const optimizedImages = await optimizeImages(source, types);

	// Step 2: Upload to CDN
	console.log("\nStep 2: Uploading to CDN...");
	const results = await uploadToCDN(optimizedImages, source);

	return results;
};
