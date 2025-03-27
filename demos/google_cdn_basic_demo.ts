import {
	type ImageType,
	measureOptimizedImagesFetchTimes,
} from "../src/utils/optimizer";
import { createOptimizedImages } from "../src/utils/optimizer";

(async () => {
	try {
		// Example with remote URL
		const remoteImageUrl =
			"https://image.wasi.co/eyJidWNrZXQiOiJzdGF0aWN3Iiwia2V5IjoiaW5tdWVibGVzXC9nMTA0MTI4MjAyMzEwMzAwNTA2NTEuanBnIiwiZWRpdHMiOnsibm9ybWFsaXNlIjp0cnVlLCJyb3RhdGUiOjAsInJlc2l6ZSI6eyJ3aWR0aCI6OTAwLCJoZWlnaHQiOjY3NSwiZml0IjoiY29udGFpbiIsImJhY2tncm91bmQiOnsiciI6MjU1LCJnIjoyNTUsImIiOjI1NSwiYWxwaGEiOjF9fX19";

		// Specify which types of images you want to generate
		const typesToGenerate: ImageType[] = ["full"]; // ["thumbnail", "full", "preview"];

		// Process remote image
		console.log("\nProcessing remote image...");
		const remoteResults = await createOptimizedImages(
			remoteImageUrl,
			typesToGenerate,
		);
		console.log("\nRemote image URLs:", remoteResults);

		// Optionally measure fetch times for remote images
		const shouldMeasureFetchTimes = true; // Can be made configurable
		if (shouldMeasureFetchTimes && remoteResults.full.isRemote) {
			console.log("\nMeasuring fetch times and sizes for remote images...");
			const fetchTimes = await measureOptimizedImagesFetchTimes(remoteResults);

			console.log("\nComparison results:");
			for (const result of fetchTimes) {
				console.log(`\n${result.type}:`);
				console.log(
					`  Original:  ${result.originalFetchTimeMs.toFixed(2)}ms, ${result.originalSizeKB.toFixed(1)}KB`,
				);
				console.log(
					`  Optimized: ${result.optimizedFetchTimeMs.toFixed(2)}ms, ${result.optimizedSizeKB.toFixed(1)}KB`,
				);
				console.log(
					`  Time improvement: ${result.timeImprovement.toFixed(1)}%`,
				);
				console.log(`  Size reduction: ${result.sizeReduction.toFixed(1)}%`);
			}
		}
	} catch (error) {
		console.error("Failed to process images:", error);
	}
})();
