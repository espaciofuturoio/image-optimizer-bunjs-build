import { createOptimizedImages, type ImageType } from "../src/utils/optimizer";

// Parse command line arguments
const args = process.argv.slice(2);
const urlIndex = args.indexOf("--url");
const typeIndex = args.indexOf("--type");

if (urlIndex === -1 || typeIndex === -1) {
	console.error(
		"Usage: bun run demos/optimize_single_image.ts --url <image_url> --type <cover|gallery>",
	);
	process.exit(1);
}

const imageUrl = args[urlIndex + 1];
const type = args[typeIndex + 1];

if (!imageUrl || !type) {
	console.error("Missing required arguments");
	process.exit(1);
}

if (type !== "full" && type !== "gallery" && type !== "thumbnail") {
	console.error("Type must be either 'full' or 'gallery' or 'thumbnail'");
	process.exit(1);
}

async function optimizeImage() {
	try {
		const results = await createOptimizedImages(imageUrl, [type as ImageType]);

		if (results?.[type]?.url) {
			console.log(JSON.stringify({ optimizedUrl: results[type].url }));
			process.exit(0);
		} else {
			console.error("Failed to optimize image");
			process.exit(1);
		}
	} catch (error) {
		console.error("Error optimizing image:", error);
		process.exit(1);
	}
}

// Set a timeout for the entire operation
const timeout = setTimeout(() => {
	console.error("Operation timed out");
	process.exit(1);
}, 30000); // 30 seconds timeout

optimizeImage().finally(() => {
	clearTimeout(timeout);
});
