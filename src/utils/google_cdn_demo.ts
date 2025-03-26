import { createImageService } from "./google_cdn";
import dotenv from "dotenv";

dotenv.config();

const imageService = createImageService(
	{
		keyFilePath: process.env.GOOGLE_CLOUD_KEY_FILE_PATH || "",
	},
	process.env.GOOGLE_CLOUD_BUCKET_NAME || "tinypic",
);

(async () => {
	try {
		// Upload the original image with metadata and custom file name
		const url = await imageService.uploadImage(
			"/Users/ruben/Documents/projects/espaciofuturoio/image-optimizer-bunjs-build/src/image.jpeg",
			"rubenabix",
			{
				cacheControl: "public, max-age=31536000, immutable, must-revalidate",
				fileName: "property-main-image.jpeg",
				metadata: {
					propertyId: "PROP123",
					roomType: "living-room",
					imageType: "main",
					optimized: "true",
					uploadedBy: "real-estate-app",
				},
			},
		);
		console.log("Original Image URL:", url);

		// Example of getting the same image URL for different use cases
		const mainImageUrl = imageService.getImageUrl(
			"rubenabix/property-main-image.jpeg",
		);
		console.log("Main Image URL:", mainImageUrl);

		// Upload a gallery image with different name
		const galleryUrl = await imageService.uploadImage(
			"/Users/ruben/Documents/projects/espaciofuturoio/image-optimizer-bunjs-build/src/image.jpeg",
			"rubenabix",
			{
				cacheControl: "public, max-age=31536000, immutable, must-revalidate",
				fileName: "property-gallery-image.jpeg",
				metadata: {
					propertyId: "PROP123",
					roomType: "living-room",
					imageType: "gallery",
					optimized: "true",
					uploadedBy: "real-estate-app",
				},
			},
		);
		console.log("Gallery Image URL:", galleryUrl);

		// Upload a thumbnail with different name
		const thumbnailUrl = await imageService.uploadImage(
			"/Users/ruben/Documents/projects/espaciofuturoio/image-optimizer-bunjs-build/src/image.jpeg",
			"rubenabix",
			{
				cacheControl: "public, max-age=31536000, immutable, must-revalidate",
				fileName: "property-thumbnail.jpeg",
				metadata: {
					propertyId: "PROP123",
					roomType: "living-room",
					imageType: "thumbnail",
					optimized: "true",
					uploadedBy: "real-estate-app",
				},
			},
		);
		console.log("Thumbnail Image URL:", thumbnailUrl);
	} catch (error) {
		console.error("Failed to upload image:", error);
	}
})();
