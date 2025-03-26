import { Storage } from "@google-cloud/storage";
import path from "node:path";
import crypto from "node:crypto";

interface StorageConfig {
	keyFilePath: string;
}

interface UploadOptions {
	cacheControl?: string;
	contentType?: string;
	metadata?: Record<string, string>;
	fileName?: string;
}

interface ImageMetadata {
	propertyId?: string;
	roomType?: string;
	imageType?: "main" | "gallery" | "thumbnail";
	originalWidth?: number;
	originalHeight?: number;
	uploadedBy: string;
	uploadedAt: string;
	originalFileName?: string;
}

// Helper function to get MIME type based on file extension
const getMimeType = (filePath: string): string => {
	const ext = path.extname(filePath).toLowerCase();
	const mimeTypes: Record<string, string> = {
		".jpg": "image/jpeg",
		".jpeg": "image/jpeg",
		".png": "image/png",
		".gif": "image/gif",
		".webp": "image/webp",
		".svg": "image/svg+xml",
	};
	return mimeTypes[ext] || "application/octet-stream";
};

const createImageService = (config: StorageConfig, bucketName: string) => {
	const storage = new Storage({ keyFilename: config.keyFilePath });
	const bucket = storage.bucket(bucketName);

	// Helper function to generate a unique file name
	const generateUniqueFileName = (originalFileName: string): string => {
		const timestamp = Date.now();
		const randomString = crypto.randomBytes(8).toString("hex");
		const extension = path.extname(originalFileName);
		const nameWithoutExt = path.basename(originalFileName, extension);
		return `${nameWithoutExt}-${timestamp}-${randomString}${extension}`;
	};

	const uploadImage = async (
		localFilePath: string,
		destinationFolder = "",
		options: UploadOptions = {},
	): Promise<string> => {
		const {
			cacheControl = "public, max-age=31536000, immutable, must-revalidate",
			metadata = {},
			fileName,
		} = options;

		// Detect content type from file extension
		const contentType = options.contentType || getMimeType(localFilePath);

		// Generate a unique file name if not provided
		const originalFileName = fileName || path.basename(localFilePath);
		const uniqueFileName = generateUniqueFileName(originalFileName);

		// Use forward slashes for consistency and database storage
		const destination = path.posix.join(destinationFolder, uniqueFileName);

		try {
			// Create a file object
			const file = bucket.file(destination);

			// Enhanced metadata for real estate images
			const enhancedMetadata: ImageMetadata = {
				...metadata,
				uploadedBy: "real-estate-app",
				uploadedAt: new Date().toISOString(),
				originalFileName,
			};

			// Upload the file with CDN optimizations
			await file.save(localFilePath, {
				metadata: {
					cacheControl,
					contentType,
					...enhancedMetadata,
				},
				resumable: true,
				chunkSize: 5 * 1024 * 1024, // 5MB chunks
			});

			// Generate clean URL for database storage
			const cleanUrl = `https://storage.googleapis.com/${bucketName}/${destination}`;

			console.log(`✅ Image uploaded successfully: ${cleanUrl}`);
			return cleanUrl;
		} catch (error) {
			console.error("❌ Error uploading image:", error);
			throw error;
		}
	};

	const downloadImage = async (
		filePathInBucket: string,
		destinationPath: string,
	): Promise<void> => {
		try {
			const file = bucket.file(filePathInBucket);
			await file.download({ destination: destinationPath });
			console.log(`✅ Image downloaded to ${destinationPath}`);
		} catch (error) {
			console.error("❌ Error downloading image:", error);
			throw error;
		}
	};

	const deleteFolder = async (folderPath: string): Promise<void> => {
		try {
			await bucket.deleteFiles({ prefix: folderPath });
			console.log(`🗑️ Folder "${folderPath}" deleted successfully`);
		} catch (error) {
			console.error("❌ Error deleting folder:", error);
			throw error;
		}
	};

	// Helper function to get CDN-optimized URL
	const getImageUrl = (imagePath: string): string => {
		return `https://storage.googleapis.com/${bucketName}/${imagePath}`;
	};

	return { uploadImage, downloadImage, deleteFolder, getImageUrl };
};

export { createImageService };
