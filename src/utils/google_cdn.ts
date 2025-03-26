import { Storage } from "@google-cloud/storage";
import path from "node:path";
import crypto from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileTypeFromBuffer } from "file-type";

// Core Image Service Types
interface ImageServiceConfig {
	keyFilePath: string;
}

interface ImageServiceOptions {
	cacheControl?: string;
	contentType?: string;
	metadata?: Record<string, string>;
}

interface ImageUrls {
	directUrl: string;
	cdnUrl: string;
	gsUrl: string;
}

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
	private cdnUrl: string;

	constructor(storage: Storage, bucketName: string, cdnUrl?: string) {
		this.storage = storage;
		this.bucketName = bucketName;
		this.cdnUrl =
			cdnUrl ||
			process.env.CDN_BASE_URL ||
			`https://storage.googleapis.com/${bucketName}`;
	}

	public generateHash(
		content: ArrayBuffer,
		metadata?: Record<string, string>,
	): string {
		const hash = crypto.createHash("sha256");
		hash.update(Buffer.from(content));

		// Include metadata in hash calculation if provided
		if (metadata) {
			// Sort metadata keys to ensure consistent hash
			const sortedMetadata = Object.keys(metadata)
				.sort()
				.map((key) => `${key}:${metadata[key]}`)
				.join("|");
			hash.update(sortedMetadata);
		}

		return hash.digest("hex");
	}

	public generateFileName(originalFileName: string, hash: string) {
		// If originalFileName starts with a dot, it's just an extension
		const extension = originalFileName.startsWith(".")
			? originalFileName
			: path.extname(originalFileName);
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
		const hash = this.generateHash(fileContent, metadata);

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
		url: string,
		outputDir: string,
	): Promise<string | null> {
		try {
			console.log("Saving image from URL:", url);

			const response = await fetch(url, {
				headers: {
					Accept: "image/webp,image/*,*/*;q=0.8",
					"Cache-Control": "no-cache",
				},
			});

			if (!response.ok) {
				throw new Error(
					`Failed to fetch image: ${response.status} ${response.statusText}`,
				);
			}

			const buffer = await response.arrayBuffer();
			console.log("Downloaded buffer size:", buffer.byteLength, "bytes");

			// Detect file type from buffer
			const fileType = await fileTypeFromBuffer(new Uint8Array(buffer));
			console.log("Detected file type:", fileType);

			// Generate hash from buffer using class method
			const hash = this.generateHash(buffer);
			console.log("Generated hash:", hash);

			// Determine extension
			let extension = ".webp"; // default
			if (fileType) {
				extension = `.${fileType.ext}`;
				console.log("Using detected extension:", extension);
			} else {
				// Fallback to URL extension or content-type
				const urlExtension = url.split(".").pop()?.toLowerCase();
				const contentType = response.headers.get("content-type") || "";
				console.log("Content-Type:", contentType);

				if (
					urlExtension &&
					["jpg", "jpeg", "png", "webp", "gif"].includes(urlExtension)
				) {
					extension = `.${urlExtension}`;
					console.log("Using URL extension:", extension);
				} else if (
					contentType.includes("jpeg") ||
					contentType.includes("jpg")
				) {
					extension = ".jpg";
					console.log("Using content-type extension:", extension);
				} else if (contentType.includes("png")) {
					extension = ".png";
					console.log("Using content-type extension:", extension);
				} else if (contentType.includes("webp")) {
					extension = ".webp";
					console.log("Using content-type extension:", extension);
				} else if (contentType.includes("gif")) {
					extension = ".gif";
					console.log("Using content-type extension:", extension);
				} else {
					console.log("No extension found, using default:", extension);
				}
			}

			// Generate unique filename
			const filename = this.generateFileName(extension, hash);
			const filepath = join(outputDir, filename);

			// Save the file
			await writeFile(filepath, new Uint8Array(buffer));
			console.log("Saved file to:", filepath);

			// Verify file was written
			const savedFile = Bun.file(filepath);
			const fileSize = savedFile.size;
			if (fileSize === 0) {
				throw new Error("File was written but has zero bytes");
			}
			console.log("Verified file size:", fileSize, "bytes");

			return filepath;
		} catch (error) {
			console.error("Error saving image:", error);
			return null;
		}
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
