import { Storage } from "@google-cloud/storage";
import path from "node:path";
import crypto from "node:crypto";

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

	public generateHash(content: ArrayBuffer): string {
		const hash = crypto.createHash("sha256");
		hash.update(Buffer.from(content));
		return hash.digest("hex");
	}

	public generateFileName(originalFileName: string, hash: string): string {
		const extension = path.extname(originalFileName);
		return `${hash}${extension}`;
	}

	public async uploadImage(
		filePath: string,
		folder: string,
		options: CoreUploadOptions = {},
	): Promise<string> {
		const {
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
		});

		const cleanUrl = `https://storage.googleapis.com/${this.bucketName}/${destination}`;
		return cleanUrl;
	}

	public getImageUrl(imagePath: string): string {
		return `https://storage.googleapis.com/${this.bucketName}/${imagePath}`;
	}

	public async saveToLocalImage(
		optimizedImageUrl: string,
		tempDir: string,
	): Promise<string> {
		// Download the optimized image
		const response = await fetch(optimizedImageUrl);
		const buffer = await response.arrayBuffer();

		// Generate hash and filename
		const hash = this.generateHash(buffer);
		const extension = path.extname(optimizedImageUrl);
		const uniqueFileName = this.generateFileName(`.${extension}`, hash);

		// Save to temp directory
		const tempFilePath = `${tempDir}/${uniqueFileName}`;
		await Bun.write(tempFilePath, buffer);

		return tempFilePath;
	}
}

// Factory function to create the appropriate service
export function createImageService(
	config: { keyFilePath: string },
	bucketName: string,
): CoreImageService {
	const storage = new Storage({
		keyFilename: config.keyFilePath,
	});

	return new CoreImageService(storage, bucketName);
}
