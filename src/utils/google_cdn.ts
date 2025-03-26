import { Storage } from "@google-cloud/storage";
import path from "node:path";
import crypto from "node:crypto";
import { file } from "bun";
import type { File as StorageFile } from "@google-cloud/storage";

// Core Image Service Types
export interface CoreUploadOptions {
	makePublic?: boolean;
	cacheControl?: string;
	contentType?: string;
	metadata?: Record<string, string>;
}

export interface CoreImageMetadata {
	fullHash: string;
	uploadedAt: string;
	[key: string]: string;
}

// Core Image Service
export class CoreImageService {
	private storage: Storage;
	private bucketName: string;

	constructor(storage: Storage, bucketName: string) {
		this.storage = storage;
		this.bucketName = bucketName;
	}

	private generateHash(content: ArrayBuffer): string {
		const hash = crypto.createHash("sha256");
		hash.update(Buffer.from(content));
		return hash.digest("hex");
	}

	private generateFileName(originalFileName: string, hash: string): string {
		const extension = path.extname(originalFileName);
		const nameWithoutExt = path.basename(originalFileName, extension);
		const cleanName = nameWithoutExt.replace(/[^a-z0-9]/gi, "-").toLowerCase();
		return `${cleanName}-${hash}${extension}`;
	}

	public async uploadImage(
		filePath: string,
		folder: string,
		options: CoreUploadOptions = {},
	): Promise<string> {
		const {
			makePublic = true,
			cacheControl = "public, max-age=31536000, immutable, must-revalidate",
			contentType = "image/webp",
			metadata = {},
		} = options;

		const fileContent = await Bun.file(filePath).arrayBuffer();
		const hash = this.generateHash(fileContent);

		// Generate unique filename using the complete hash
		const uniqueFileName = this.generateFileName(path.basename(filePath), hash);
		const destination = `${folder}/${uniqueFileName}`;
		const gcsFile = this.storage.bucket(this.bucketName).file(destination);

		// Check if file already exists
		const [exists] = await gcsFile.exists();
		if (exists) {
			console.log(`📝 File already exists with hash ${hash}`);
			const cleanUrl = `https://storage.googleapis.com/${this.bucketName}/${destination}`;
			return cleanUrl;
		}

		const imageMetadata: CoreImageMetadata = {
			fullHash: hash,
			uploadedAt: new Date().toISOString(),
			...metadata,
		};

		await gcsFile.save(Buffer.from(fileContent), {
			metadata: {
				contentType,
				cacheControl,
				metadata: imageMetadata,
			},
			public: makePublic,
		});

		const cleanUrl = `https://storage.googleapis.com/${this.bucketName}/${destination}`;
		return cleanUrl;
	}

	public getImageUrl(imagePath: string): string {
		return `https://storage.googleapis.com/${this.bucketName}/${imagePath}`;
	}
}

// Real Estate Specific Types
export interface RealEstateUploadOptions extends CoreUploadOptions {
	metadata: {
		propertyId: string;
		roomType: string;
		imageType: "main" | "gallery" | "thumbnail";
		optimized: "true" | "false";
		uploadedBy: string;
	} & Record<string, string>;
}

// Real Estate Image Service
export class RealEstateImageService extends CoreImageService {
	public async uploadPropertyImage(
		filePath: string,
		folder: string,
		options: RealEstateUploadOptions,
	): Promise<string> {
		return this.uploadImage(filePath, folder, options);
	}

	public getOptimizedImageUrl(
		imagePath: string,
		useCase: "thumbnail" | "gallery" | "full",
	): string {
		// Since Google Cloud Storage doesn't support transformations,
		// we'll just return the base URL for now
		// In a real application, you might want to:
		// 1. Use a separate image processing service (like Cloudinary)
		// 2. Pre-generate different sizes during upload
		// 3. Use a CDN that supports transformations
		return this.getImageUrl(imagePath);
	}
}

// Factory function to create the appropriate service
export function createImageService(
	config: { keyFilePath: string },
	bucketName: string,
	type: "core" | "real-estate" = "core",
): CoreImageService | RealEstateImageService {
	const storage = new Storage({
		keyFilename: config.keyFilePath,
	});

	return type === "real-estate"
		? new RealEstateImageService(storage, bucketName)
		: new CoreImageService(storage, bucketName);
}
