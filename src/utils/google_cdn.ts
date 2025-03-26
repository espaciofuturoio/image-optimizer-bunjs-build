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

// Add new interface for URL formats
export interface ImageUrls {
	cdnUrl: string;
	directUrl: string;
	gsUrl: string;
}

// Core Image Service
export class CoreImageService {
	private storage: Storage;
	private bucketName: string;
	private cdnUrl: string;

	constructor(storage: Storage, bucketName: string, cdnUrl?: string) {
		this.storage = storage;
		this.bucketName = bucketName;
		this.cdnUrl =
			cdnUrl ||
			process.env.CDN_BASE_URL ||
			`https://storage.googleapis.com/${bucketName}`;
	}

	public generateHash(content: ArrayBuffer): string {
		const hash = crypto.createHash("sha256");
		hash.update(Buffer.from(content));
		return hash.digest("hex");
	}

	public generateFileName(originalFileName: string, hash: string) {
		const extension = path.extname(originalFileName);
		return `${hash}${extension}`;
	}

	public getImageUrls(imagePath: string): ImageUrls {
		// Extract the hash and extension from the imagePath
		const hash = path.basename(imagePath, path.extname(imagePath));
		const extension = path.extname(imagePath);
		const folder = path.dirname(imagePath).replace(/\\/g, "/"); // Normalize path separators

		// Use CDN URL for all URLs
		const objectPath = `${folder}/${hash}${extension}`;
		const cdnUrl = `${this.cdnUrl}/${objectPath}`;
		const directUrl = `https://storage.googleapis.com/${this.bucketName}/${objectPath}`;

		return {
			cdnUrl,
			directUrl,
			gsUrl: `gs://${this.bucketName}/${objectPath}`,
		};
	}

	public async uploadImage(
		filePath: string,
		folder: string,
		options: CoreUploadOptions = {},
	): Promise<ImageUrls> {
		const {
			cacheControl = "public, max-age=31536000, immutable, must-revalidate, stale-while-revalidate=86400",
			contentType = "image/webp",
			metadata = {},
		} = options;

		const fileContent = await Bun.file(filePath).arrayBuffer();
		const hash = this.generateHash(fileContent);

		// Generate unique filename using the complete hash
		const uniqueFileName = this.generateFileName(path.basename(filePath), hash);
		const destination = `${folder.replace(/\\/g, "/")}/${uniqueFileName}`; // Normalize path separators
		const gcsFile = this.storage.bucket(this.bucketName).file(destination);

		// Check if file already exists
		const [exists] = await gcsFile.exists();
		if (exists) {
			console.log(`📝 File already exists with hash ${hash}`);
			return this.getImageUrls(destination);
		}

		const imageMetadata: CoreImageMetadata = {
			fullHash: hash,
			uploadedAt: new Date().toISOString(),
			...metadata,
		};

		await gcsFile.save(Buffer.from(fileContent), {
			metadata: {
				contentType,
				metadata: imageMetadata,
				cacheControl,
				customMetadata: {
					"serving-versioned": "true",
					"cdn-cache-control": "max-age=31536000",
					"edge-cache-ttl": "31536000",
				},
			},
		});

		return this.getImageUrls(destination);
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
	cdnUrl?: string,
): CoreImageService {
	const storage = new Storage({
		keyFilename: config.keyFilePath,
	});

	return new CoreImageService(storage, bucketName, cdnUrl);
}
