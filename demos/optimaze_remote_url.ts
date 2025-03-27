import { createOptimizedImages, type ImageType } from "../src/utils/optimizer";
import {
	readFileSync,
	writeFileSync,
	existsSync,
	renameSync,
	unlinkSync,
} from "node:fs";

interface Property {
	id: string;
	title: string;
	price: string;
	location: string;
	details: Record<string, string>;
	imageCoverPreviewUrl: string;
	galleryImages: string[];
	listingUrl: string;
	pageNumber: number;
	locationComponents: {
		city: string;
		province: string;
		country: string;
	};
	description: string;
	spanishDescription: string;
	englishDescription: string;
	assessor: {
		name: string;
		phone: string;
		email: string;
		profileImageUrl: string;
		id: string;
	};
	latitude: number;
	longitude: number;
	coordinateSource: string;
	mapUrl: string;
	googleMapsUrl: string;
	appleMapsUrl: string;
	universalMapsUrl: string;
	allDetails: Record<string, string>;
	insideFeatures: string[];
	outsideFeatures: string[];
	geolocation: {
		coordinates: {
			latitude: number;
			longitude: number;
		};
		maps: {
			openStreetMap: string;
			googleMaps: string;
			appleMaps: string;
			universalLink: string;
		};
		source: string;
	};
	sourceDir: {
		resultDir: string;
		propertyDir: string;
	};
}

interface OptimizedProperty
	extends Omit<Property, "imageCoverPreviewUrl" | "galleryImages"> {
	imageCoverPreviewUrl: string;
	galleryImages: string[];
	optimizedImages: {
		cover: {
			original: string;
			optimized: string;
		};
		gallery: Array<{
			original: string;
			optimized: string;
		}>;
	};
}

interface ProcessingError {
	propertyId: string;
	error: string;
	timestamp: string;
	type: "cover" | "gallery" | "property";
	imageUrl?: string;
}

interface ProcessingState {
	processedProperties: string[];
	failedProperties: Property[];
	lastProcessedIndex: number;
	startTime: string;
	errors: ProcessingError[];
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000; // 2 seconds
const OPERATION_TIMEOUT_MS = 30000; // 30 seconds
const PROGRESS_INTERVAL_MS = 5000; // 5 seconds
const BATCH_SIZE = 5; // Number of properties to process concurrently
const ERROR_LOG_FILE = "./processing_errors.json";

const STATE_FILE = "./processing_state.json";
const STATE_TEMP_FILE = "./processing_state.temp.json";
const OPTIMIZED_FILE = "./optimized_properties.json";
const OPTIMIZED_TEMP_FILE = "./optimized_properties.temp.json";
const FAILED_FILE = "./failed_properties.json";
const FAILED_TEMP_FILE = "./failed_properties.temp.json";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Parse command line arguments
const args = process.argv.slice(2);
const forceStart = args.includes("--force");

const atomicWrite = (filePath: string, tempPath: string, data: any) => {
	try {
		// Write to temporary file first
		writeFileSync(tempPath, JSON.stringify(data, null, 2));
		// Rename temp file to actual file (atomic operation)
		renameSync(tempPath, filePath);
	} catch (error) {
		// Clean up temp file if it exists
		if (existsSync(tempPath)) {
			unlinkSync(tempPath);
		}
		throw error;
	}
};

const loadProcessingState = (): ProcessingState => {
	if (forceStart) {
		console.log("Force flag detected. Starting fresh...");
		return {
			processedProperties: [],
			failedProperties: [],
			lastProcessedIndex: -1,
			startTime: new Date().toISOString(),
			errors: [],
		};
	}

	if (existsSync(STATE_FILE)) {
		try {
			return JSON.parse(readFileSync(STATE_FILE, "utf-8"));
		} catch (error) {
			console.error("Failed to load processing state:", error);
		}
	}
	return {
		processedProperties: [],
		failedProperties: [],
		lastProcessedIndex: -1,
		startTime: new Date().toISOString(),
		errors: [],
	};
};

const saveProcessingState = (state: ProcessingState) => {
	atomicWrite(STATE_FILE, STATE_TEMP_FILE, state);
};

const saveIntermediateResults = (
	properties: Property[],
	currentIndex: number,
	failedProperties: Property[],
) => {
	// Save optimized properties
	atomicWrite(
		OPTIMIZED_FILE,
		OPTIMIZED_TEMP_FILE,
		properties.slice(0, currentIndex + BATCH_SIZE),
	);

	// Save failed properties if any
	if (failedProperties.length > 0) {
		atomicWrite(FAILED_FILE, FAILED_TEMP_FILE, failedProperties);
	}
};

const withTimeout = async <T>(
	operation: () => Promise<T>,
	timeoutMs: number,
): Promise<T> => {
	const timeoutPromise = new Promise<never>((_, reject) => {
		setTimeout(() => reject(new Error("Operation timed out")), timeoutMs);
	});

	return Promise.race([operation(), timeoutPromise]);
};

const retryWithBackoff = async <T>(
	operation: () => Promise<T>,
	retries = MAX_RETRIES,
): Promise<T> => {
	try {
		return await withTimeout(operation, OPERATION_TIMEOUT_MS);
	} catch (error) {
		if (retries === 0) throw error;
		console.log(`Operation failed, retrying... (${retries} attempts left)`);
		await sleep(RETRY_DELAY_MS);
		return retryWithBackoff(operation, retries - 1);
	}
};

const printProgress = (state: ProcessingState, totalProperties: number) => {
	const startTime = new Date(state.startTime);
	const elapsed = Date.now() - startTime.getTime();
	const elapsedHours = Math.floor(elapsed / 3600000);
	const elapsedMinutes = Math.floor((elapsed % 3600000) / 60000);
	const elapsedSeconds = Math.floor((elapsed % 60000) / 1000);

	const timeString =
		elapsedHours > 0
			? `${elapsedHours}h ${elapsedMinutes}m ${elapsedSeconds}s`
			: `${elapsedMinutes}m ${elapsedSeconds}s`;

	console.log("\n=== Progress Summary ===");
	console.log(`Time elapsed: ${timeString}`);
	console.log(
		`Properties processed: ${state.processedProperties.length}/${totalProperties}`,
	);
	console.log(`Failed properties: ${state.failedProperties.length}`);
	console.log(`Current index: ${state.lastProcessedIndex + 1}`);
	console.log("=====================\n");
};

const logError = (error: ProcessingError) => {
	let errors: ProcessingError[] = [];
	if (existsSync(ERROR_LOG_FILE)) {
		try {
			errors = JSON.parse(readFileSync(ERROR_LOG_FILE, "utf-8"));
		} catch (e) {
			console.error("Failed to read error log:", e);
		}
	}
	errors.push(error);
	writeFileSync(ERROR_LOG_FILE, JSON.stringify(errors, null, 2));
};

const processProperty = async (
	property: Property,
	index: number,
	total: number,
): Promise<void> => {
	console.log(`\nProcessing property: ${property.id} (${index + 1}/${total})`);

	// Process cover image
	console.log("\nProcessing cover image...");
	try {
		const coverResults = await retryWithBackoff(() =>
			createOptimizedImages(property.imageCoverPreviewUrl, ["full"]),
		);
		console.log("\nCover image URLs:", coverResults.full.url);
		property.imageCoverPreviewUrl = coverResults.full.url;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logError({
			propertyId: property.id,
			error: errorMessage,
			timestamp: new Date().toISOString(),
			type: "cover",
			imageUrl: property.imageCoverPreviewUrl,
		});
		throw new Error(`Cover image processing failed: ${errorMessage}`);
	}

	// Process gallery images
	console.log("\nProcessing gallery images...");
	const optimizedGalleryImages: string[] = [];
	const failedGalleryImages: { index: number; url: string; error: string }[] =
		[];

	for (const [index, galleryImage] of property.galleryImages.entries()) {
		console.log(
			`\nProcessing gallery image ${index + 1}/${property.galleryImages.length}...`,
		);
		try {
			const galleryResults = await retryWithBackoff(() =>
				createOptimizedImages(galleryImage, ["full"]),
			);
			console.log(`Gallery image ${index + 1} URLs:`, galleryResults.full.url);
			optimizedGalleryImages.push(galleryResults.full.url);
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			logError({
				propertyId: property.id,
				error: errorMessage,
				timestamp: new Date().toISOString(),
				type: "gallery",
				imageUrl: galleryImage,
			});
			failedGalleryImages.push({
				index,
				url: galleryImage,
				error: errorMessage,
			});
			// Keep the original URL if optimization fails
			optimizedGalleryImages.push(galleryImage);
		}
	}

	// Update gallery images with optimized ones (or original ones if optimization failed)
	property.galleryImages = optimizedGalleryImages;

	// If all gallery images failed, throw an error
	if (failedGalleryImages.length === property.galleryImages.length) {
		throw new Error(`All gallery images failed for property ${property.id}`);
	}

	// Log summary of failed gallery images if any
	if (failedGalleryImages.length > 0) {
		console.warn(
			`\nWarning: ${failedGalleryImages.length} gallery images failed for property ${property.id}`,
		);
		for (const { index, error } of failedGalleryImages) {
			console.warn(`- Image ${index + 1}: ${error}`);
		}
	}
};

const processBatch = async (
	properties: Property[],
	startIndex: number,
	batchSize: number,
	state: ProcessingState,
): Promise<void> => {
	const endIndex = Math.min(startIndex + batchSize, properties.length);
	const batch = properties.slice(startIndex, endIndex);

	const promises = batch.map((property, index) =>
		processProperty(property, startIndex + index, properties.length)
			.then(() => {
				state.processedProperties.push(property.id);
				state.lastProcessedIndex = startIndex + index;
				saveProcessingState(state);
			})
			.catch((error) => {
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				logError({
					propertyId: property.id,
					error: errorMessage,
					timestamp: new Date().toISOString(),
					type: "property",
				});
				console.error(
					`Failed to process property ${property.id}:`,
					errorMessage,
				);
				state.failedProperties.push(property);
				state.processedProperties.push(property.id);
				state.lastProcessedIndex = startIndex + index;
				saveProcessingState(state);
			}),
	);

	await Promise.all(promises);
};

(async () => {
	let state: ProcessingState = {
		processedProperties: [],
		failedProperties: [],
		lastProcessedIndex: -1,
		startTime: new Date().toISOString(),
		errors: [],
	};
	let properties: Property[] = [];

	try {
		// Read properties from JSON file
		properties = JSON.parse(readFileSync("./properties.json", "utf-8"));

		// Load previous processing state
		state = loadProcessingState();
		if (!forceStart) {
			console.log(`Resuming from index ${state.lastProcessedIndex + 1}`);
		} else {
			console.log("Starting from beginning...");
		}

		// Start progress interval
		const progressInterval = setInterval(() => {
			printProgress(state, properties.length);
		}, PROGRESS_INTERVAL_MS);

		// Process properties in batches
		for (
			let i = state.lastProcessedIndex + 1;
			i < properties.length;
			i += BATCH_SIZE
		) {
			await processBatch(properties, i, BATCH_SIZE, state);

			// Save intermediate results after each batch
			saveIntermediateResults(properties, i, state.failedProperties);
		}

		// Clear progress interval
		clearInterval(progressInterval);

		console.log("\nProcessing completed!");
		printProgress(state, properties.length);
		console.log(
			"Results saved to optimized_properties.json and failed_properties.json",
		);
		process.exit(0);
	} catch (error) {
		console.error("Failed to process images:", error);
		printProgress(state, properties.length);
		console.log(
			"\nScript interrupted. You can resume later by running the script again.",
		);
	}
})();
