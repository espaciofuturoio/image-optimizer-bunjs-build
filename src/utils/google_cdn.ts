import { Storage } from "@google-cloud/storage";
import path from "node:path";
import crypto from "node:crypto";

// Core Image Service Types
export interface CoreUploadOptions {
	makePublic?: boolean;
	cacheControl?: string;
	contentType?: string;
	metadata?: Record<string, string>;
	region?: "asia" | "eu" | "us" | "sa";
}

export interface CoreImageMetadata {
	fullHash: string;
	uploadedAt: string;
	[key: string]: string;
}

interface GeoLocation {
	continent: string;
	country: string;
	region: string;
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

	private getCDNUrl(destination: string, region?: string): string {
		// Default global CDN URL
		if (!region) {
			return `https://${this.bucketName}.storage.googleapis.com/${destination}`;
		}

		// Region-specific CDN URLs
		switch (region) {
			case "asia":
				return `https://${this.bucketName}.storage.googleapis.com/${destination}`;
			case "eu":
				return `https://europe-west1-${this.bucketName}.storage.googleapis.com/${destination}`;
			case "us":
				return `https://us-central1-${this.bucketName}.storage.googleapis.com/${destination}`;
			case "sa":
				return `https://southamerica-east1-${this.bucketName}.storage.googleapis.com/${destination}`;
			default:
				return `https://${this.bucketName}.storage.googleapis.com/${destination}`;
		}
	}

	private async detectUserRegion(): Promise<"asia" | "eu" | "us" | "sa"> {
		try {
			const response = await fetch("https://ipapi.co/json/");
			const data = (await response.json()) as GeoLocation;

			// Prioritize Central America and USA
			if (
				data.country === "CR" ||
				data.country === "GT" ||
				data.country === "BZ" ||
				data.country === "HN" ||
				data.country === "SV" ||
				data.country === "NI" ||
				data.country === "PA"
			) {
				// Use US region for Central America as it's closest
				return "us";
			}

			// For other regions, keep the default mapping
			switch (data.continent) {
				case "NA": // North America
					return "us"; // Prioritized for USA
				case "SA": // South America
					return "us"; // Changed to US for better latency from Central America
				case "AS": // Asia
					return "asia";
				case "EU": // Europe
					return "eu";
				default:
					return "us"; // Default to US since it's your primary target
			}
		} catch (error) {
			console.warn("Failed to detect region:", error);
			return "us"; // Default to US for your target audience
		}
	}

	public async uploadImage(
		filePath: string,
		folder: string,
		options: CoreUploadOptions = {},
	): Promise<string> {
		// If no region specified, detect it automatically
		if (!options.region) {
			options.region = await this.detectUserRegion();
		}

		const {
			cacheControl = "public, max-age=31536000, immutable, must-revalidate, stale-while-revalidate=86400",
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
			const cleanUrl = this.getCDNUrl(destination, options.region);
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
				contentEncoding: "gzip",
				cacheControl:
					"public, max-age=31536000, immutable, must-revalidate, stale-while-revalidate=86400",
				customMetadata: {
					"serving-versioned": "true",
					"cdn-cache-control": "max-age=31536000",
					"edge-cache-ttl": "31536000",
				},
			},
		});

		const cleanUrl = this.getCDNUrl(destination, options.region);
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
