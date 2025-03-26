import { chromium } from "playwright";
import { optimizeImageServer } from "./image_compression_util";
import type {
	ProgrammaticOptimizeOptions,
	OptimizedImageResult,
} from "./image_compression_util";

const DEFAULT_QUALITY = 75;
const DEFAULT_MAX_SIZE_MB = 1;
const DEFAULT_MAX_RESOLUTION = 1920;

interface WindowWithOptimizeImage extends Window {
	optimizeImage: () => Promise<{
		success: boolean;
		base64Data?: string;
		width?: number;
		height?: number;
		size?: number;
		error?: string;
	}>;
}

export const optimizeImageWithPlaywright = async (
	filePath: string,
	options: ProgrammaticOptimizeOptions,
): Promise<OptimizedImageResult> => {
	const browser = await chromium.launch();
	const context = await browser.newContext();
	const page = await context.newPage();

	try {
		// Read the file
		const file = await Bun.file(filePath);
		const fileBuffer = await file.arrayBuffer();
		const fileName = filePath.split("/").pop() || "image";
		const fileType = file.type || "image/jpeg";

		// Create a data URL from the file
		const base64Data = Buffer.from(fileBuffer).toString("base64");
		const dataUrl = `data:${fileType};base64,${base64Data}`;

		// Inject the necessary HTML and JavaScript
		await page.setContent(`
      <!DOCTYPE html>
      <html>
        <head>
          <script src="https://cdn.jsdelivr.net/npm/browser-image-compression@2.0.2/dist/browser-image-compression.js"></script>
          <script src="https://cdn.jsdelivr.net/npm/webp-converter-browser@1.0.0/dist/webp-converter-browser.min.js"></script>
        </head>
        <body>
          <canvas id="canvas" style="display: none;"></canvas>
          <script>
            window.optimizeImage = async function() {
              try {
                const img = new Image();
                img.src = '${dataUrl}';
                await new Promise((resolve, reject) => {
                  img.onload = resolve;
                  img.onerror = reject;
                });

                const canvas = document.getElementById('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);

                const quality = ${options.quality || DEFAULT_QUALITY} / 100;
                const format = '${options.format}';
                const maxWidth = ${options.maxWidth || DEFAULT_MAX_RESOLUTION};
                const maxHeight = ${options.maxHeight || DEFAULT_MAX_RESOLUTION};
                const maxSizeMB = ${options.maxSizeMB || DEFAULT_MAX_SIZE_MB};

                // Resize if needed
                if (img.width > maxWidth || img.height > maxHeight) {
                  const ratio = Math.min(maxWidth / img.width, maxHeight / img.height);
                  canvas.width = img.width * ratio;
                  canvas.height = img.height * ratio;
                  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                }

                // Convert to desired format
                const blob = await new Promise(resolve => {
                  canvas.toBlob(resolve, \`image/\${format}\`, quality);
                });

                // Compress if needed
                const compressedBlob = await imageCompression(blob, {
                  maxSizeMB,
                  maxWidthOrHeight: Math.max(maxWidth, maxHeight),
                  useWebWorker: true
                });

                // Convert blob to base64 for transfer
                const reader = new FileReader();
                const base64Promise = new Promise((resolve) => {
                  reader.onloadend = () => resolve(reader.result);
                });
                reader.readAsDataURL(compressedBlob);
                const imageBase64 = await base64Promise;

                return {
                  success: true,
                  base64Data: imageBase64,
                  width: canvas.width,
                  height: canvas.height,
                  size: compressedBlob.size
                };
              } catch (error) {
                return {
                  success: false,
                  error: error.message
                };
              }
            }
          </script>
        </body>
      </html>
    `);

		// Execute the optimization
		const result = await page.evaluate(() =>
			(window as unknown as WindowWithOptimizeImage).optimizeImage(),
		);

		if (!result.success) {
			throw new Error(result.error);
		}

		// Convert base64 to buffer
		const imageBase64 = result.base64Data?.split(",")[1] || "";
		const buffer = Buffer.from(imageBase64, "base64");

		// Create a new file with the optimized image
		const optimizedFileName = `${fileName.replace(/\.[^/.]+$/, "")}.${options.format}`;
		const optimizedFile = new File([buffer.buffer], optimizedFileName, {
			type: `image/${options.format}`,
		});

		// Send to server for final optimization
		const serverResult = await optimizeImageServer(optimizedFile, {
			format: options.format,
			quality: options.quality || DEFAULT_QUALITY,
			width: result.width,
			height: result.height,
			sourceFormat: options.format,
		});

		return serverResult;
	} catch (error) {
		console.error("Playwright image optimization failed:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
			url: "",
			size: 0,
			width: 0,
			height: 0,
			format: options.format,
		};
	} finally {
		await browser.close();
	}
};
