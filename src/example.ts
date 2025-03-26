import { optimizeImageWithPlaywright } from "./playwright_optimizer";

async function main() {
	try {
		// Get the image path from command line arguments
		const imagePath = process.argv[2];

		if (!imagePath) {
			console.error("Please provide an image path as an argument");
			console.error("Usage: bun run src/example.ts <image-path>");
			process.exit(1);
		}

		console.log(`Processing image: ${imagePath}`);

		const result = await optimizeImageWithPlaywright(imagePath, {
			format: "webp",
			quality: 75,
			maxWidth: 1920,
			maxHeight: 1080,
			maxSizeMB: 1,
		});

		if (result.success) {
			console.log("Image optimization successful!");
			console.log("Optimized image URL:", result.url);
			console.log("Original size:", result.originalSize);
			console.log("Optimized size:", result.size);
			console.log("Compression ratio:", result.compressionRatio);
			console.log("Dimensions:", `${result.width}x${result.height}`);
		} else {
			console.error("Image optimization failed:", result.error);
		}
	} catch (error) {
		console.error("Error:", error);
	}
}

main();
