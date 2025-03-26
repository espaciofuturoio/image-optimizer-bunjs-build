import { createImageService } from "./google_cdn";
import type { RealEstateImageService } from "./google_cdn";
import dotenv from "dotenv";
import path from "node:path";

dotenv.config();

// Create real estate specific image service
const imageService = createImageService(
	{
		keyFilePath: process.env.GOOGLE_CLOUD_KEY_FILE_PATH || "",
	},
	process.env.GOOGLE_CLOUD_BUCKET_NAME || "tinypic",
	"real-estate",
) as RealEstateImageService;

(async () => {
	try {
		const imagePath =
			"/Users/ruben/Documents/projects/espaciofuturoio/image-optimizer-bunjs-build/src/image.jpeg";

		console.log("🔄 Testing content-based file naming and deduplication...");

		// First upload - should create a new file
		const url1 = await imageService.uploadPropertyImage(
			imagePath,
			"rubenabix",
			{
				cacheControl: "public, max-age=31536000, immutable, must-revalidate",
				metadata: {
					propertyId: "PROP123",
					roomType: "living-room",
					imageType: "main",
					optimized: "true",
					uploadedBy: "real-estate-app",
				},
			},
		);
		console.log("\n1️⃣ First upload URL:", url1);

		// Second upload of the same file - should return the same URL (deduplication)
		const url2 = await imageService.uploadPropertyImage(
			imagePath,
			"rubenabix",
			{
				cacheControl: "public, max-age=31536000, immutable, must-revalidate",
				metadata: {
					propertyId: "PROP456", // Different metadata shouldn't affect deduplication
					roomType: "bedroom",
					imageType: "gallery",
					optimized: "true",
					uploadedBy: "real-estate-app",
				},
			},
		);
		console.log("\n2️⃣ Second upload URL (should be same):", url2);

		// Verify URLs are the same (deduplication working)
		console.log("\n✅ URLs match:", url1 === url2);

		console.log(
			"\n📝 Note: For image transformations (resize, optimize, etc.), consider:",
		);
		console.log(
			"   1. Using a dedicated image processing service (e.g., Cloudinary)",
		);
		console.log("   2. Pre-generating different sizes during upload");
		console.log("   3. Using a CDN that supports transformations");
		console.log("   4. Implementing server-side image processing");

		// The following would test collision handling in production:
		// 1. Different images that generate the same short hash
		// 2. System would detect collision and append a suffix
		// 3. Both images would be stored with different suffixes

		console.log(
			"\n📝 Note: In production, if two different images generate the same short hash:",
		);
		console.log("   - System will detect the collision");
		console.log("   - Compare full content to verify difference");
		console.log("   - Append a suffix (-1, -2, etc.) to handle collisions");
		console.log("   - Store both images with their unique names");
	} catch (error) {
		console.error("Failed to upload image:", error);
	}
})();
