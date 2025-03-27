import { createOptimizedImages, type ImageType } from "../src/utils/optimizer";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

interface Property {
	id: string;
	imageCoverPreviewUrl: string;
	galleryImages: string[];
	title: string;
	price: string;
	location: string;
	details: {
		bedrooms: string;
		bathrooms: string;
		area: string;
		landSize: string;
		propertyType: string;
		contactInfo: string;
	};
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

interface OptimizationResult {
	property: Property;
	error?: string;
}

async function optimizePropertyImages(
	property: Property,
): Promise<OptimizationResult> {
	try {
		// Optimize cover image
		const coverResults = await createOptimizedImages(
			property.imageCoverPreviewUrl,
			["full"],
		);
		if (coverResults?.full?.url) {
			property.imageCoverPreviewUrl = coverResults.full.url;
		}

		// Optimize gallery images
		const optimizedGalleryImages = await Promise.all(
			property.galleryImages.map(async (url) => {
				const results = await createOptimizedImages(url, ["full"]);
				return results?.full?.url || url;
			}),
		);
		property.galleryImages = optimizedGalleryImages;

		return { property };
	} catch (error) {
		console.error(
			`Error optimizing images for property ${property.id}:`,
			error,
		);
		return {
			property,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

async function main() {
	try {
		// Create optimized directory if it doesn't exist
		const optimizedDir = join(process.cwd(), "optimized");
		mkdirSync(optimizedDir, { recursive: true });

		// Read properties.json
		const properties = JSON.parse(
			readFileSync("properties.json", "utf-8"),
		) as Property[];

		console.log(`Starting optimization of ${properties.length} properties...`);

		// Process each property
		const results = await Promise.all(
			properties.map(async (property, index) => {
				console.log(
					`Processing property ${index + 1}/${properties.length}: ${property.id}`,
				);
				return optimizePropertyImages(property);
			}),
		);

		// Separate successful and failed optimizations
		const successfulProperties = results
			.filter((result) => !result.error)
			.map((result) => result.property);

		const failedProperties = results
			.filter((result) => result.error)
			.map((result) => ({
				...result.property,
				optimizationError: result.error,
			}));

		// Write successful properties to optimized/properties.json
		const outputPath = join(optimizedDir, "properties.json");
		writeFileSync(outputPath, JSON.stringify(successfulProperties, null, 2));
		console.log(`Successfully optimized properties saved to ${outputPath}`);

		// Write failed properties to optimized/failed_properties.json
		const failedOutputPath = join(optimizedDir, "failed_properties.json");
		writeFileSync(failedOutputPath, JSON.stringify(failedProperties, null, 2));
		console.log(`Failed properties saved to ${failedOutputPath}`);

		// Log summary
		console.log("\nOptimization Summary:");
		console.log(`Total properties: ${properties.length}`);
		console.log(`Successfully optimized: ${successfulProperties.length}`);
		console.log(`Failed to optimize: ${failedProperties.length}`);
	} catch (error) {
		console.error("Error processing properties:", error);
		process.exit(1);
	}
}

// Set a timeout for the entire operation
const timeout = setTimeout(() => {
	console.error("Operation timed out");
	process.exit(1);
}, 300000); // 5 minutes timeout

main().finally(() => {
	clearTimeout(timeout);
});
