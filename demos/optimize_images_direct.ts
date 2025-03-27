import { optimizeImage } from "../src/features/images/image_optimizer";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createImageService } from "../src/utils/google_cdn";
import { ENV } from "../src/env";

// ANSI color codes
const colors = {
	reset: "\x1b[0m",
	bright: "\x1b[1m",
	dim: "\x1b[2m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	magenta: "\x1b[35m",
	cyan: "\x1b[36m",
	white: "\x1b[37m",
};

interface OptimizationResult {
	imageUrl: string;
	originalSize: number;
	optimizedSize: number;
	processingTime: number;
	compressionRatio: number;
	success: boolean;
	error?: string;
	outputPath?: string;
	cdnUrl?: string;
}

interface Assessor {
	name: string;
	phone: string;
	email: string;
	profileImageUrl: string;
	id: string;
}

interface Property {
	id: string;
	imageCoverPreviewUrl: string;
	galleryImages: string[];
	profileImageUrl?: string;
	assessor?: Assessor;
	[key: string]: string | string[] | Assessor | undefined;
}

// Initialize image service
const imageService = createImageService(
	{
		keyFilePath: ENV.GOOGLE_CLOUD_KEY_FILE_PATH,
	},
	ENV.GOOGLE_CLOUD_BUCKET_NAME,
	ENV.CDN_BASE_URL,
);

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
		console.log(
			`\n${colors.cyan}Processing image:${colors.reset} ${colors.yellow}${imageUrl}${colors.reset}`,
		);

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
		console.log(
			`${colors.blue}Original size:${colors.reset} ${colors.green}${(originalSize / 1024).toFixed(2)}KB${colors.reset}`,
		);

		// Optimize image
		console.log(`\n${colors.cyan}Optimizing image...${colors.reset}`);
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
		console.log(
			`${colors.blue}Optimized size:${colors.reset} ${colors.green}${(result.size / 1024).toFixed(2)}KB${colors.reset} (${colors.yellow}${((result.size / originalSize) * 100).toFixed(1)}%${colors.reset} of original)`,
		);
		console.log(
			`${colors.blue}Processing time:${colors.reset} ${colors.green}${processingTime.toFixed(2)}ms${colors.reset}`,
		);

		// Upload to CDN
		console.log(`\n${colors.cyan}Uploading to CDN...${colors.reset}`);
		const uploadStart = performance.now();
		const uploadResult = await imageService.uploadImage(
			result.path,
			"rubenabix/optimized",
			{
				cacheControl: "public, max-age=31536000, immutable, must-revalidate",
				contentType: `image/${options.format || "webp"}`,
				metadata: {
					originalSize: originalSize.toString(),
					optimizedSize: result.size.toString(),
					compressionRatio: ((result.size / originalSize) * 100).toString(),
					width: (options.width || 1200).toString(),
					format: options.format || "webp",
					quality: (options.quality || 75).toString(),
				},
			},
		);
		const uploadEnd = performance.now();
		console.log(
			`${colors.blue}CDN upload time:${colors.reset} ${colors.green}${(uploadEnd - uploadStart).toFixed(2)}ms${colors.reset}`,
		);
		console.log(
			`${colors.blue}Direct URL:${colors.reset} ${colors.yellow}${uploadResult.directUrl}${colors.reset}`,
		);

		return {
			imageUrl,
			originalSize,
			optimizedSize: result.size,
			processingTime,
			compressionRatio: (result.size / originalSize) * 100,
			success: true,
			outputPath: result.path,
			cdnUrl: uploadResult.directUrl,
		};
	} catch (error) {
		console.error(
			`\n${colors.red}Error processing image ${imageUrl}:${colors.reset}`,
		);
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

interface ProgressState {
	timestamp: string;
	processedUrls: string[];
	urlReplacements: Record<string, string>;
	results: OptimizationResult[];
	totalImages: number;
	processedProperties: number;
}

async function saveProgress(
	progressDir: string,
	state: ProgressState,
): Promise<void> {
	writeFileSync(
		join(progressDir, "progress.json"),
		JSON.stringify(state, null, 2),
	);
}

async function loadProgress(
	progressDir: string,
): Promise<ProgressState | null> {
	const progressFile = join(progressDir, "progress.json");
	if (existsSync(progressFile)) {
		const content = readFileSync(progressFile, "utf-8");
		return JSON.parse(content);
	}
	return null;
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
		outputDir: "output",
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

	// Create output directories
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
	const baseDir = join(options.outputDir, timestamp);
	const imagesDir = join(baseDir, "images");
	const resultsDir = join(baseDir, "results");
	const progressDir = join(options.outputDir, "progress"); // Fixed progress directory

	mkdirSync(imagesDir, { recursive: true });
	mkdirSync(resultsDir, { recursive: true });
	mkdirSync(progressDir, { recursive: true });

	// Update options with new image directory
	options.outputDir = imagesDir;

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
			timestamp: new Date().toISOString(),
		};

		writeFileSync(
			join(resultsDir, "optimization_result.json"),
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
		if (result.cdnUrl) {
			console.log(`CDN URL: ${result.cdnUrl}`);
		}
	} else {
		// Process all images from properties.json
		const properties = JSON.parse(readFileSync("properties.json", "utf-8"));
		console.log(
			`\n${colors.magenta}Starting optimization process...${colors.reset}`,
		);
		console.log(
			`${colors.blue}Total properties to process:${colors.reset} ${colors.green}${properties.length}${colors.reset}`,
		);

		// Try to load previous progress
		const previousProgress = await loadProgress(progressDir);
		let state: ProgressState;

		if (previousProgress) {
			console.log(
				`\n${colors.yellow}Found previous progress from ${previousProgress.timestamp}${colors.reset}`,
			);
			console.log(
				`${colors.blue}Previously processed:${colors.reset} ${colors.green}${previousProgress.processedUrls.length}${colors.reset} images`,
			);
			const shouldResume = await new Promise<boolean>((resolve) => {
				process.stdout.write(
					`${colors.yellow}Do you want to resume from previous progress? (y/n): ${colors.reset}`,
				);
				process.stdin.once("data", (data) => {
					resolve(data.toString().trim().toLowerCase() === "y");
				});
			});

			if (shouldResume) {
				state = previousProgress;
				console.log(
					`${colors.green}Resuming from previous progress...${colors.reset}`,
				);
			} else {
				state = {
					timestamp: new Date().toISOString(),
					processedUrls: [],
					urlReplacements: {},
					results: [],
					totalImages: 0,
					processedProperties: 0,
				};
				console.log(`${colors.yellow}Starting fresh...${colors.reset}`);
			}
		} else {
			state = {
				timestamp: new Date().toISOString(),
				processedUrls: [],
				urlReplacements: {},
				results: [],
				totalImages: 0,
				processedProperties: 0,
			};
		}

		// Convert urlReplacements from object to Map
		const urlReplacements = new Map(Object.entries(state.urlReplacements));

		// Calculate total images to process
		const totalImagesToProcess = properties.reduce(
			(total: number, property: Property) => {
				let count = 0;
				if (property.profileImageUrl) count++;
				if (property.assessor?.profileImageUrl) count++;
				if (property.imageCoverPreviewUrl) count++;
				count += property.galleryImages?.length || 0;
				return total + count;
			},
			0,
		);

		console.log(
			`${colors.blue}Total images to process:${colors.reset} ${colors.green}${totalImagesToProcess}${colors.reset}\n`,
		);

		// Process properties
		for (const property of properties) {
			state.processedProperties++;
			console.log(
				`${colors.magenta}Processing property:${colors.reset} ${colors.yellow}${property.id}${colors.reset} (${colors.cyan}${state.processedProperties}/${properties.length}${colors.reset})`,
			);

			// Process profile image
			if (
				property.profileImageUrl &&
				!state.processedUrls.includes(property.profileImageUrl)
			) {
				state.totalImages++;
				console.log(
					`${colors.cyan}Processing image:${colors.reset} ${colors.yellow}${state.totalImages}/${totalImagesToProcess}${colors.reset}`,
				);
				const profileResult = await optimizeImageDirect(
					property.profileImageUrl,
					options,
				);
				state.results.push(profileResult);
				if (profileResult.success && profileResult.cdnUrl) {
					urlReplacements.set(property.profileImageUrl, profileResult.cdnUrl);
					state.urlReplacements[property.profileImageUrl] =
						profileResult.cdnUrl;
				}
				state.processedUrls.push(property.profileImageUrl);
				await saveProgress(progressDir, state);
			}

			// Process assessor profile image
			if (
				property.assessor?.profileImageUrl &&
				!state.processedUrls.includes(property.assessor.profileImageUrl)
			) {
				state.totalImages++;
				console.log(
					`${colors.cyan}Processing image:${colors.reset} ${colors.yellow}${state.totalImages}/${totalImagesToProcess}${colors.reset}`,
				);
				const assessorProfileResult = await optimizeImageDirect(
					property.assessor.profileImageUrl,
					options,
				);
				state.results.push(assessorProfileResult);
				if (assessorProfileResult.success && assessorProfileResult.cdnUrl) {
					urlReplacements.set(
						property.assessor.profileImageUrl,
						assessorProfileResult.cdnUrl,
					);
					state.urlReplacements[property.assessor.profileImageUrl] =
						assessorProfileResult.cdnUrl;
				}
				state.processedUrls.push(property.assessor.profileImageUrl);
				await saveProgress(progressDir, state);
			}

			// Process cover image
			if (!state.processedUrls.includes(property.imageCoverPreviewUrl)) {
				state.totalImages++;
				console.log(
					`${colors.cyan}Processing image:${colors.reset} ${colors.yellow}${state.totalImages}/${totalImagesToProcess}${colors.reset}`,
				);
				const coverResult = await optimizeImageDirect(
					property.imageCoverPreviewUrl,
					options,
				);
				state.results.push(coverResult);
				if (coverResult.success && coverResult.cdnUrl) {
					urlReplacements.set(
						property.imageCoverPreviewUrl,
						coverResult.cdnUrl,
					);
					state.urlReplacements[property.imageCoverPreviewUrl] =
						coverResult.cdnUrl;
				}
				state.processedUrls.push(property.imageCoverPreviewUrl);
				await saveProgress(progressDir, state);
			}

			if (!property.galleryImages) {
				console.error(
					`\n${colors.red}Error processing image ${property.id}:${colors.reset} No gallery images found`,
				);
				continue;
			}

			// Process gallery images
			for (const galleryUrl of property.galleryImages) {
				if (!state.processedUrls.includes(galleryUrl)) {
					state.totalImages++;
					console.log(
						`${colors.cyan}Processing image:${colors.reset} ${colors.yellow}${state.totalImages}/${totalImagesToProcess}${colors.reset}`,
					);
					const galleryResult = await optimizeImageDirect(galleryUrl, options);
					state.results.push(galleryResult);
					if (galleryResult.success && galleryResult.cdnUrl) {
						urlReplacements.set(galleryUrl, galleryResult.cdnUrl);
						state.urlReplacements[galleryUrl] = galleryResult.cdnUrl;
					}
					state.processedUrls.push(galleryUrl);
					await saveProgress(progressDir, state);
				}
			}
		}

		// Calculate averages
		const successfulResults = state.results.filter((r) => r.success);
		const averages = {
			totalImages: state.totalImages,
			successfulImages: successfulResults.length,
			failedImages: state.results.length - successfulResults.length,
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
			individualResults: state.results,
			averages,
			timestamp: new Date().toISOString(),
		};

		writeFileSync(
			join(resultsDir, "optimization_results.json"),
			JSON.stringify(output, null, 2),
		);

		// Create updated properties with new URLs
		const updatedProperties = properties.map((property: Property) => ({
			...property,
			profileImageUrl: property.profileImageUrl
				? urlReplacements.get(property.profileImageUrl) ||
					property.profileImageUrl
				: property.profileImageUrl,
			assessor: property.assessor
				? {
						...property.assessor,
						profileImageUrl: property.assessor.profileImageUrl
							? urlReplacements.get(property.assessor.profileImageUrl) ||
								property.assessor.profileImageUrl
							: property.assessor.profileImageUrl,
					}
				: property.assessor,
			imageCoverPreviewUrl:
				urlReplacements.get(property.imageCoverPreviewUrl) ||
				property.imageCoverPreviewUrl,
			galleryImages: property.galleryImages.map(
				(url: string) => urlReplacements.get(url) || url,
			),
		}));

		// Save updated properties
		writeFileSync(
			join(resultsDir, "properties_updated.json"),
			JSON.stringify(updatedProperties, null, 2),
		);

		// Log summary
		console.log(`\n${colors.magenta}Optimization Summary:${colors.reset}`);
		console.log(
			`${colors.blue}Total images processed:${colors.reset} ${colors.green}${state.totalImages}${colors.reset}`,
		);
		console.log(
			`${colors.blue}Successfully processed:${colors.reset} ${colors.green}${successfulResults.length}${colors.reset}`,
		);
		console.log(
			`${colors.blue}Failed to process:${colors.reset} ${colors.red}${state.results.length - successfulResults.length}${colors.reset}`,
		);
		console.log(`\n${colors.magenta}Average Results:${colors.reset}`);
		console.log(
			`${colors.blue}Original size:${colors.reset} ${colors.green}${(averages.averageOriginalSize / 1024).toFixed(2)}KB${colors.reset}`,
		);
		console.log(
			`${colors.blue}Optimized size:${colors.reset} ${colors.green}${(averages.averageOptimizedSize / 1024).toFixed(2)}KB${colors.reset}`,
		);
		console.log(
			`${colors.blue}Average compression ratio:${colors.reset} ${colors.green}${averages.averageCompressionRatio.toFixed(2)}%${colors.reset}`,
		);
		console.log(
			`${colors.blue}Average processing time:${colors.reset} ${colors.green}${averages.averageProcessingTime.toFixed(2)}ms${colors.reset}`,
		);
		console.log(
			`\n${colors.magenta}Updated properties saved to:${colors.reset} ${colors.yellow}${join(resultsDir, "properties_updated.json")}${colors.reset}`,
		);
	}
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
