import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { uploadImage } from './upload'
import {
  compressImage,
  convertToWebP,
  optimizeImageServer,
  isHeicOrHeifImage,
  convertHeicToJpeg,
  isAvifImage,
  convertAvifToWebP,
} from './image_compression_util'

type Format = 'webp' | 'avif' | 'jpeg' | 'png'

// Define accepted file types
const ACCEPTED_FILE_TYPES = "image/jpeg,image/png,image/gif,image/webp,image/avif,image/heic,image/heif"
const ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.heic', '.heif']
const ACCEPTED_FORMATS: Format[] = ['webp', 'avif', 'jpeg', 'png']

// Default configuration values
const DEFAULT_QUALITY = 75
const DEFAULT_MAX_SIZE_MB = 1
const DEFAULT_MAX_RESOLUTION = 2048
const MAX_FILE_SIZE_MB = 40 // 40MB file size limit

// Utility function to format bytes into KB and MB
const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 KB'
  const k = 1024
  const kb = (bytes / k).toFixed(2)
  const mb = (bytes / (k * k)).toFixed(2)
  return bytes < k * k ? `${kb} KB` : `${mb} MB`
}

// Utility function to validate file
const validateFile = (file: File): { valid: boolean; message: string } => {
  // Check file size (40MB limit)
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    return {
      valid: false,
      message: `File too large. Maximum size is ${MAX_FILE_SIZE_MB}MB.`
    };
  }

  // Validate MIME type
  const validMimeType = ACCEPTED_FILE_TYPES.includes(file.type);

  // Check if it's a likely video file based on common video MIME types
  if (file.type.startsWith('video/')) {
    return {
      valid: false,
      message: 'Videos are not supported. Please upload an image file.'
    };
  }

  // Double-check file extension as fallback
  const fileName = file.name.toLowerCase();
  const hasValidExtension = ACCEPTED_EXTENSIONS.some(ext => fileName.endsWith(ext));

  // Check for common video extensions, even if MIME type wasn't detected correctly
  const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.wmv', '.flv', '.webm', '.mkv', '.m4v'];
  if (VIDEO_EXTENSIONS.some(ext => fileName.endsWith(ext))) {
    return {
      valid: false,
      message: 'Videos are not supported. Please upload an image file.'
    };
  }

  if (!validMimeType && !hasValidExtension) {
    return {
      valid: false,
      message: 'Invalid file type. Only images are accepted.'
    };
  }

  return { valid: true, message: '' };
};

// Read the first few bytes of a file to check its signature
const readFileHeader = async (file: File): Promise<Uint8Array> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const arr = new Uint8Array(reader.result as ArrayBuffer);
      resolve(arr.slice(0, 16)); // Increased to 16 bytes to better detect video formats
    };
    reader.onerror = () => reject(new Error('Failed to read file header'));

    // Read only the beginning of the file
    const blob = file.slice(0, 16);
    reader.readAsArrayBuffer(blob);
  });
};

// Check if the file header corresponds to a valid image format
const isValidImageHeader = (header: Uint8Array): boolean => {
  // First check for video/document formats that should be rejected

  // Check for MP4/QuickTime formats ('ftyp' at bytes 4-7 and common subtypes)
  const isFtyp = header[4] === 0x66 && header[5] === 0x74 && header[6] === 0x79 && header[7] === 0x70;
  if (isFtyp) {
    // Check for common video format subtypes
    const subtype = String.fromCharCode.apply(null, Array.from(header.slice(8, 12)));
    const videoSubtypes = ['mp4', 'avc', 'iso', 'MP4', 'qt', 'mov', 'M4V', 'm4v'];
    if (videoSubtypes.some(type => subtype.includes(type))) {
      return false; // This is a video file, not an image
    }
  }

  // Check for WebM video signature (bytes 0-3: 0x1A 0x45 0xDF 0xA3)
  if (header[0] === 0x1A && header[1] === 0x45 && header[2] === 0xDF && header[3] === 0xA3) {
    return false; // WebM video file
  }

  // Check for AVI format (starts with "RIFF" and then has "AVI")
  if (header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46 &&
    header[8] === 0x41 && header[9] === 0x56 && header[10] === 0x49) {
    return false; // AVI video file
  }

  // Now check for valid image formats

  // JPEG signature: starts with FF D8
  if (header[0] === 0xFF && header[1] === 0xD8) return true;

  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47) return true;

  // GIF signature: "GIF87a" (47 49 46 38 37 61) or "GIF89a" (47 49 46 38 39 61)
  if (header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x38 &&
    (header[4] === 0x37 || header[4] === 0x39) && header[5] === 0x61) return true;

  // WebP: starts with "RIFF" and later contains "WEBP"
  if (header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46 &&
    header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50) return true;

  // HEIC/HEIF can be harder to detect, often start with "ftyp"
  // Basic check for AVIF/HEIF containers, but make sure it's not a video subtype
  if (isFtyp) {
    const subtype = String.fromCharCode.apply(null, Array.from(header.slice(8, 12)));
    const imageSubtypes = ['heic', 'mif1', 'msf1', 'avif', 'hevc'];
    if (imageSubtypes.some(type => subtype.includes(type))) {
      return true; // This is a HEIC/AVIF image
    }
  }

  return false;
};

interface SimpleImageUploaderProps {
  onClientSide?: boolean;
}

export const SimpleImageUploader: React.FC<SimpleImageUploaderProps> = ({ onClientSide = true }) => {
  console.log('SimpleImageUploader component rendering, onClientSide:', onClientSide);

  // Only initialize state if on client side to avoid hydration mismatch
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState<boolean>(false)
  const [uploadStatus, setUploadStatus] = useState<{
    success: boolean;
    message: string;
  }>({ success: true, message: '' })
  const [toast, setToast] = useState({ visible: false, message: '' })
  const [originalFile, setOriginalFile] = useState<File | null>(null)
  const [originalSize, setOriginalSize] = useState<number | null>(null)
  const [serverStats, setServerStats] = useState<{
    size: number;
    width: number;
    height: number;
    format: string;
  } | null>(null)
  const [originalDimensions, setOriginalDimensions] = useState<{ width: number, height: number } | null>(null)
  const [processingImage, setProcessingImage] = useState(false)
  const [sliderPosition, setSliderPosition] = useState(50)
  const [useSliderComparison, setUseSliderComparison] = useState(true)
  const [selectedFormat, setSelectedFormat] = useState<Format>('webp')
  const [previousFormat, setPreviousFormat] = useState<Format>('webp')
  const latestSelectedFormat = useRef<Format>(selectedFormat)

  // Server-side rendering placeholder
  if (!onClientSide) {
    return (
      <div className="image-uploader server-version">
        <div className="uploader-container">
          <div className="upload-area">
            <div className="upload-placeholder">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <title>Upload Icon</title>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <h3>Upload Image</h3>
              <p>Drag & drop or click to select</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Simple toast notification system - make stable with useCallback
  const showToast = useCallback((message: string, duration = 3000) => {
    setToast({ visible: true, message });
    setTimeout(() => {
      setToast({ visible: false, message: '' });
    }, duration);
  }, []);

  // Process file - wrapped with useCallback to avoid dependency cycles
  const processFile = useCallback((file: File) => {
    if (file) {
      // Show processing state
      setProcessingImage(true);

      // Reset stats before reprocessing
      setServerStats(null);

      // Clear the uploaded URL to force image refresh when format changes
      setUploadedUrl(null);

      // Process with the current format
      processAndUploadFile(file);
    }
  }, []);

  // Handle mouse move on slider container for touch devices
  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.buttons !== 1) return; // Only execute during drag (left mouse button)

    const container = event.currentTarget;
    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const position = (x / rect.width) * 100;

    // Clamp position between 0 and 100
    setSliderPosition(Math.max(0, Math.min(100, position)));
  };

  // Handle touch move on slider container for mobile devices
  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    const container = event.currentTarget;
    const rect = container.getBoundingClientRect();
    const touch = event.touches[0];
    const x = touch.clientX - rect.left;
    const position = (x / rect.width) * 100;

    // Clamp position between 0 and 100
    setSliderPosition(Math.max(0, Math.min(100, position)));

    // Prevent scrolling while dragging
    event.preventDefault();
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0]
    if (!selectedFile) return

    // Validate file before processing
    const validation = validateFile(selectedFile);
    if (!validation.valid) {
      setUploadStatus({ success: false, message: validation.message });
      showToast(validation.message);
      return;
    }

    // Clear previous state completely
    setPreviewUrl(null)
    setUploadedUrl(null)
    setUploadStatus({ success: true, message: '' })
    setServerStats(null)
    setOriginalDimensions(null)
    setProcessingImage(true)

    try {
      // Save original file info
      setOriginalFile(selectedFile)
      setOriginalSize(selectedFile.size)

      // Process the file (matching the original uploader's logic)
      await processAndUploadFile(selectedFile)
    } catch (error) {
      console.error('Error processing image:', error)
      showToast(`Error: ${error instanceof Error ? error.message : String(error)}`)
      setProcessingImage(false)
    }
  }

  const processAndUploadFile = async (selectedFile: File) => {
    try {
      // Additional security check - re-validate mime type by checking file signature
      // This helps prevent file type spoofing
      const fileHeader = await readFileHeader(selectedFile);
      if (!isValidImageHeader(fileHeader)) {
        // Try to determine if this is a video file or something else
        const headerStr = String.fromCharCode.apply(null, Array.from(fileHeader.slice(0, 16)));

        if (headerStr.includes('ftyp') && ['mp4', 'qt', 'mov', 'M4V'].some(str => headerStr.includes(str))) {
          throw new Error('Video files cannot be processed. Please upload an image file instead.');
        } if (headerStr.includes('RIFF') && headerStr.includes('AVI')) {
          throw new Error('Video files cannot be processed. Please upload an image file instead.');
        } if ([0x1A, 0x45, 0xDF, 0xA3].every((val, i) => fileHeader[i] === val)) {
          throw new Error('WebM video files cannot be processed. Please upload an image file instead.');
        }
        throw new Error('File appears to be corrupted or not a valid image format.');

      }

      // Set original preview
      const previewObjectUrl = URL.createObjectURL(selectedFile);
      setPreviewUrl(previewObjectUrl);

      // Extract original dimensions
      const img = new Image();
      img.onload = () => {
        setOriginalDimensions({
          width: img.width,
          height: img.height
        });
      };
      img.src = previewObjectUrl;

      // Check if file is HEIC/HEIF format
      let isHeic = false;
      if (!selectedFile.type.includes('jpeg') && !selectedFile.type.includes('jpg')) {
        try {
          isHeic = await isHeicOrHeifImage(selectedFile);
        } catch (error) {
          console.error('Error during HEIC detection:', error);
        }
      }

      // Handle HEIC conversion if needed
      let processedFile = selectedFile;
      if (isHeic) {
        try {
          showToast('Converting HEIC for preview...');
          const jpegFile = await convertHeicToJpeg(selectedFile, DEFAULT_QUALITY);
          if (jpegFile && jpegFile.size > 0) {
            setPreviewUrl(URL.createObjectURL(jpegFile));
            processedFile = jpegFile;
            showToast('HEIC converted to JPG for display');
          }
        } catch (heicError) {
          console.error('HEIC conversion failed:', heicError);
          showToast('HEIC conversion failed. File may not display correctly.');
        }
      }

      // Client-side processing
      let clientProcessedFile = processedFile;

      // Handle AVIF conversion if needed
      const isAvifSource = isAvifImage(processedFile);
      if (isAvifSource) {
        showToast('Processing AVIF image...');
        try {
          const webpFile = await convertAvifToWebP(processedFile, DEFAULT_QUALITY);
          if (webpFile && webpFile.size > 0) {
            clientProcessedFile = webpFile;
          }
        } catch (avifError) {
          console.error('AVIF conversion failed:', avifError);
        }
      }
      // Apply WebP conversion for non-AVIF files
      else if (selectedFormat === 'webp') {
        try {
          clientProcessedFile = await convertToWebP(processedFile, DEFAULT_QUALITY);
        } catch (webpError) {
          console.error('WebP conversion failed:', webpError);
        }
      }

      // Apply basic compression
      try {
        clientProcessedFile = await compressImage(clientProcessedFile, {
          maxSizeMB: DEFAULT_MAX_SIZE_MB,
          maxWidthOrHeight: DEFAULT_MAX_RESOLUTION,
          useWebWorker: true,
          alwaysKeepResolution: false,
        });
      } catch (compressionError) {
        console.error('Compression failed:', compressionError);
      }

      // Send to server for optimization
      setIsUploading(true);
      // Use the ref to get the latest selected format
      const currentFormat = latestSelectedFormat.current;
      showToast(`Uploading to server for ${currentFormat.toUpperCase()} optimization...`);

      try {
        console.log(`Optimizing image to ${currentFormat} format (using ref for latest value)`);

        // Use server-side optimization with the current selected format
        const result = await optimizeImageServer(clientProcessedFile, {
          format: currentFormat,
          quality: DEFAULT_QUALITY,
          width: DEFAULT_MAX_RESOLUTION,
          height: undefined,
          isHeic: isHeic,
          sourceFormat: processedFile.type.split('/')[1] || undefined
        });

        console.log(`Server API call completed with format=${currentFormat}, returned format=${result.format}`);

        if (result.success) {
          console.log(`Server optimization successful: ${result.format} format, ${result.size} bytes`);

          // Save the detailed image info
          setServerStats({
            size: result.size,
            width: result.width,
            height: result.height,
            format: result.format
          });

          setUploadedUrl(result.url);
          setUploadStatus({ success: true, message: 'Image optimized and uploaded successfully' });
          showToast(`${result.format.toUpperCase()} conversion complete!`);
        } else {
          console.error('Server optimization failed:', result.error);
          // Try direct upload as fallback
          await directUpload(clientProcessedFile);
        }
      } catch (error) {
        console.error('Server optimization failed:', error);
        showToast('Server optimization failed. Trying direct upload...');

        // Fallback to direct upload
        await directUpload(clientProcessedFile);
      }
    } catch (error) {
      console.error('Processing failed:', error);
      setUploadStatus({ success: false, message: String(error) });
    } finally {
      setIsUploading(false);
      setProcessingImage(false);
    }
  };

  const directUpload = async (fileToUpload: File) => {
    try {
      showToast('Performing direct upload...');
      const response = await uploadImage(fileToUpload);
      const url = response.result?.variants?.[0];

      if (url) {
        setUploadedUrl(url);

        // Estimate stats based on client-side knowledge
        if (fileToUpload) {
          setServerStats({
            size: fileToUpload.size,
            width: 0, // We don't know the dimensions from direct upload
            height: 0,
            format: fileToUpload.type.split('/')[1] || 'unknown'
          });
        }

        setUploadStatus({ success: true, message: 'Image uploaded successfully' });
        showToast('Image uploaded successfully');
        return true;
      }

      throw new Error('Upload returned no URL');
    } catch (error) {
      console.error('Direct upload failed:', error);
      setUploadStatus({
        success: false,
        message: error instanceof Error ? error.message : 'Upload failed'
      });
      showToast('Upload failed. Please try again.');
      return false;
    }
  };

  const reductionPercentage = useMemo(() => {
    if (!originalSize || !serverStats) return null;
    const percentage = ((originalSize - serverStats.size) / originalSize * 100).toFixed(1);
    console.log(`Reduction percentage: ${percentage}`);
    return percentage;
  }, [originalSize, serverStats]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      showToast('Copied to clipboard!')
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleDownloadImage = async () => {
    if (!uploadedUrl) return;

    try {
      showToast('Preparing download...');

      // Try to handle potential CORS issues by fetching the image first
      try {
        const response = await fetch(uploadedUrl, { mode: 'cors' });
        if (!response.ok) throw new Error('Failed to fetch image');

        const blob = await response.blob();

        // Create object URL from the blob
        const objectUrl = URL.createObjectURL(blob);

        // Generate filename from original filename or create a new one
        let filename = '';
        if (originalFile?.name) {
          // Extract base name without extension
          const baseName = originalFile.name.replace(/\.[^/.]+$/, '');
          // Use server format or fallback to extracted format from URL
          const format = serverStats?.format || uploadedUrl.split('.').pop() || 'webp';
          filename = `${baseName}.${format}`;
        } else {
          // Fallback to URL filename or generate one
          const urlFilename = uploadedUrl.split('/').pop();
          if (urlFilename?.includes('.')) {
            filename = urlFilename;
          } else {
            filename = `image-${Date.now()}.${serverStats?.format || 'webp'}`;
          }
        }

        // Create a temporary link and trigger download
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = filename;
        link.style.display = 'none';

        // Add to DOM, click and cleanup
        document.body.appendChild(link);
        link.click();

        // Cleanup after a short delay to ensure download starts
        setTimeout(() => {
          document.body.removeChild(link);
          URL.revokeObjectURL(objectUrl);
        }, 100);

        showToast('Download started!');
      } catch (fetchError) {
        console.warn('Fetch download failed, falling back to direct link:', fetchError);

        // Fallback to direct download if fetch fails
        const link = document.createElement('a');
        link.href = uploadedUrl;

        // Generate filename from the URL or use a default
        const urlParts = uploadedUrl.split('/');
        let filename = urlParts[urlParts.length - 1];

        if (!filename.includes('.')) {
          if (originalFile?.name) {
            const originalExt = originalFile.name.split('.').pop();
            const newExt = serverStats?.format || 'webp';
            filename = originalFile.name.replace(
              new RegExp(`\\.${originalExt}$`),
              `.${newExt}`
            );
          } else {
            filename = `image-${Date.now()}.${serverStats?.format || 'webp'}`;
          }
        }

        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showToast('Download initiated via direct link');
      }
    } catch (error) {
      console.error('Download failed:', error);
      showToast('Download failed. Try right-clicking the image and selecting "Save Image As..."');
    }
  };

  // When selectedFormat changes, update the ref
  useEffect(() => {
    latestSelectedFormat.current = selectedFormat;
  }, [selectedFormat]);

  // Format change handler
  const handleFormatChange = useCallback((format: Format) => {
    if (originalFile) {
      console.log(`Format change requested: ${selectedFormat} -> ${format}`);

      // Set processing state to show loading indicators
      setProcessingImage(true);
      setIsUploading(true);

      // Clear previous image URL and stats to ensure UI refreshes
      setUploadedUrl(null);
      setServerStats(null);

      // Update the selected format immediately
      setSelectedFormat(format);
      // Also update the ref
      latestSelectedFormat.current = format;

      // Clear previous stats when reprocessing
      if (format === previousFormat) {
        // If clicking the same format, still reprocess
        console.log(`Refreshing same format: ${format}`);
        showToast(`Refreshing ${format.toUpperCase()} format...`);
      } else {
        setPreviousFormat(format);
        console.log(`Converting to new format: ${format}`);
        showToast(`Converting to ${format.toUpperCase()} format...`);
      }

      // Do this with a slight delay to allow the UI to update
      setTimeout(() => {
        console.log(`Processing file with format: ${format}`);
        processFile(originalFile);
      }, 50);
    } else if (format !== selectedFormat) {
      // Just update the format if no file is loaded
      console.log(`No file loaded, just updating format preference to: ${format}`);
      setSelectedFormat(format);
    }
  }, [originalFile, selectedFormat, previousFormat, processFile, showToast]);

  // Re-process image when format changes
  useEffect(() => {
    // Since we're handling format changes directly in the handleFormatChange function,
    // we don't need to reprocess here again. This effect should only update previousFormat
    // for tracking purposes.
    if (selectedFormat !== previousFormat) {
      setPreviousFormat(selectedFormat);
    }
  }, [selectedFormat, previousFormat]);

  return (
    <div className="flex flex-col items-center p-2 sm:p-4 max-w-5xl mx-auto w-full">
      {/* Container for the entire uploader - card only on larger screens */}
      <div className="w-full bg-base-100 rounded-lg sm:shadow-xl sm:card">
        <div className="p-3 sm:p-6 sm:card-body">
          <h2 className="text-center mx-auto mb-4 sm:mb-6 text-2xl sm:text-3xl font-bold text-primary">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <title>Optimized Image Icon</title>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Image Optimizer
          </h2>

          {/* Format selector */}
          <div className="form-control w-full max-w-lg mx-auto mb-4">
            <label className="label pb-2" htmlFor="format-select">
              <span className="label-text text-base font-medium flex items-center">
                Output format
              </span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {ACCEPTED_FORMATS.map(format => (
                <label
                  key={format}
                  className={`flex flex-col items-center justify-center p-3 border-2 rounded-lg cursor-pointer transition-all ${selectedFormat === format
                    ? 'border-primary bg-primary/10 shadow-sm'
                    : 'border-base-300 hover:border-primary/50 hover:bg-base-200'
                    } ${isUploading || processingImage ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  <input
                    type="radio"
                    className="hidden"
                    name="format"
                    value={format}
                    checked={selectedFormat === format}
                    onChange={() => handleFormatChange(format)}
                    disabled={isUploading || processingImage}
                  />
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 mb-2 flex items-center justify-center text-primary">
                      {format === 'webp' && (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <title>WebP Format</title>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 1-6.23-.693L5 14.5m14.8.8 1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0 1 12 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
                        </svg>
                      )}
                      {format === 'avif' && (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <title>AVIF Format</title>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
                        </svg>
                      )}
                      {format === 'jpeg' && (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <title>JPEG Format</title>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                        </svg>
                      )}
                      {format === 'png' && (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <title>PNG Format</title>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75 2.25 12l4.179 2.25m0-4.5 5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0 4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0-5.571 3-5.571-3" />
                        </svg>
                      )}
                    </div>
                    <span className="font-medium text-sm uppercase">{format}</span>
                    <span className="text-xs mt-1 text-base-content/70 text-center">
                      {format === 'webp' && 'Best balance'}
                      {format === 'avif' && 'Smallest size'}
                      {format === 'jpeg' && 'Compatible'}
                      {format === 'png' && 'Lossless'}
                    </span>
                  </div>
                </label>
              ))}
            </div>
            <div className="text-xs text-base-content/70 mt-2 px-1">
              {selectedFormat === 'webp' && 'Modern format with good compression and quality, supported by most browsers'}
              {selectedFormat === 'avif' && 'Next-gen format with excellent compression, but less browser support'}
              {selectedFormat === 'jpeg' && 'Standard format supported everywhere, best for photos'}
              {selectedFormat === 'png' && 'Lossless format preserves all details, larger file size, good for graphics'}
            </div>
          </div>

          {/* File Input with drop zone */}
          <div className="form-control w-full max-w-lg mx-auto">
            <label className="label pb-2 sm:pb-4" htmlFor="file-input">
              <span className="label-text text-base sm:text-lg font-medium flex items-center">
                Choose an image file to compress
              </span>
            </label>
            <label
              className={`flex flex-col items-center justify-center w-full h-24 sm:h-32 px-2 sm:px-4 transition bg-base-200 border-2 border-base-300 border-dashed rounded-lg appearance-none cursor-pointer hover:border-primary hover:bg-base-300 focus:outline-none ${isUploading || processingImage ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              <div className="flex flex-col items-center justify-center pt-3 pb-4 sm:pt-5 sm:pb-6">
                <svg className="w-6 h-6 sm:w-8 sm:h-8 text-primary mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <title>Upload Icon</title>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="mb-1 text-xs sm:text-sm">
                  <span className="font-semibold">Click to upload</span> or drag and drop
                </p>
                <p className="text-xs text-base-content/70">
                  JPEG, PNG, GIF, WebP, AVIF, HEIC - Max {MAX_FILE_SIZE_MB}MB
                </p>
              </div>
              <input
                type="file"
                id="file-input"
                className="hidden"
                accept={ACCEPTED_FILE_TYPES}
                onChange={handleFileSelect}
                disabled={isUploading || processingImage}
              />
            </label>
          </div>

          {/* Status message area */}
          {uploadStatus.success === false && (
            <div className="alert alert-error my-4 w-full max-w-lg mx-auto shadow-md text-sm sm:text-base">
              <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24"><title>Error Icon</title><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span>{uploadStatus.message || 'Upload failed'}</span>
            </div>
          )}

          {/* Enhanced Loading Animation */}
          {(isUploading || processingImage) && (
            <div className="bg-base-200 w-full max-w-lg mx-auto my-4 rounded-lg p-4 sm:p-6 sm:card sm:card-body">
              <div className="flex flex-col items-center w-full">
                <div className="loading loading-spinner loading-lg text-primary mb-3" />
                <h3 className="font-bold text-lg">
                  {isUploading ? 'Optimizing your image...' : 'Processing image...'}
                </h3>
                <p className="text-xs sm:text-sm text-base-content/70 mt-2 max-w-md">
                  {isUploading
                    ? 'Your image is being magically compressed while maintaining quality'
                    : 'Preparing your image for optimal compression'}
                </p>
                <div className="w-full bg-base-300 rounded-full h-2.5 mt-6 overflow-hidden">
                  <div className="bg-primary h-2.5 rounded-full animate-[progress_2s_ease-in-out_infinite]" style={{ width: '75%' }} />
                </div>
              </div>
            </div>
          )}

          {/* Image Comparison - Only show when not processing */}
          {!processingImage && !isUploading && originalFile && previewUrl && uploadedUrl && serverStats && (
            <div className="w-full mt-3 sm:mt-6">
              <div className="divider my-1 sm:my-2">
                <div className="badge badge-primary">Results</div>
              </div>

              {/* Compression stats summary - more compact on mobile */}
              <div className="stats stats-vertical sm:stats-horizontal bg-base-100 shadow-lg mb-4 sm:mb-6 w-full overflow-x-auto text-xs sm:text-sm">
                <div className="stat py-3 sm:py-5">
                  <div className="stat-title text-xs sm:text-sm font-medium opacity-80">Original</div>
                  <div className="stat-value text-base sm:text-lg">{originalSize ? formatBytes(originalSize) : 'N/A'}</div>
                  <div className="text-xs opacity-70">{originalFile.type.split('/')[1].toUpperCase()} {originalDimensions && `${originalDimensions.width}×${originalDimensions.height}`}</div>
                </div>

                <div className="stat py-3 sm:py-5">
                  <div className="stat-title text-xs sm:text-sm font-medium opacity-80">Optimized</div>
                  <div className="stat-value text-base sm:text-lg">{formatBytes(serverStats.size)}</div>
                  <div className="text-xs opacity-70">{serverStats.format.toUpperCase()} {serverStats.width > 0 && `${serverStats.width}×${serverStats.height}`}</div>
                </div>

                <div className="stat py-3 sm:py-5 rounded-lg">
                  <div className="stat-title text-xs sm:text-sm font-medium opacity-90">Saved</div>
                  <div className="flex justify-center">
                    <div className="stat-value text-lg sm:text-2xl font-bold badge badge-primary">{reductionPercentage}%</div>
                  </div>
                  <div className="text-xs sm:text-sm font-medium">
                    <span className="inline-flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <title>File Size Reduction</title>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                      </svg>
                      {reductionPercentage && Number.parseFloat(reductionPercentage) > 0 ? ` ${reductionPercentage}% smaller` : 'No reduction'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Comparison mode selector - simplified and more touch-friendly */}
              <div className="flex justify-center mb-3 sm:mb-6">
                <div className="join rounded-lg shadow-sm">
                  <button
                    type="button"
                    className={`join-item btn btn-sm sm:btn-md ${useSliderComparison ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setUseSliderComparison(true)}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <title>Slider View</title>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                    </svg>
                    Slider
                  </button>
                  <button
                    type="button"
                    className={`join-item btn btn-sm sm:btn-md ${!useSliderComparison ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setUseSliderComparison(false)}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <title>Side by Side View</title>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    Side by Side
                  </button>
                </div>
              </div>

              {useSliderComparison ? (
                <div className="w-full max-w-4xl mx-auto mb-4">
                  {/* Image comparison with slider */}
                  <div
                    className="relative w-full overflow-hidden rounded-lg shadow-sm sm:shadow-md select-none"
                    style={{
                      aspectRatio: originalDimensions ? `${originalDimensions.width}/${originalDimensions.height}` : '1/1',
                      maxHeight: '60vh'
                    }}
                    onMouseMove={handleMouseMove}
                    onTouchMove={handleTouchMove}
                  >
                    {/* Original image in the background */}
                    <div className="absolute inset-0 bg-base-200 grid place-items-center">
                      <img
                        src={previewUrl}
                        alt="Original"
                        className="w-full h-full object-contain max-h-[60vh]"
                      />
                    </div>

                    {/* Optimized image overlay with clip mask based on slider */}
                    <div
                      className="absolute inset-0 bg-base-200 grid place-items-center overflow-hidden"
                      style={{ clipPath: `inset(0 0 0 ${sliderPosition}%)` }}
                    >
                      <img
                        src={uploadedUrl}
                        alt="Optimized"
                        className="w-full h-full object-contain max-h-[60vh]"
                      />
                    </div>

                    {/* Slider divider line */}
                    <div
                      className="absolute top-0 bottom-0 w-0.5 sm:w-1 bg-primary cursor-ew-resize z-10"
                      style={{ left: `${sliderPosition}%` }}
                    >
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-primary shadow-md z-20 flex items-center justify-center text-primary-content">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <title>Slider Handle</title>
                          <path d="M10 8L6 12L10 16M14 8L18 12L14 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    </div>

                    {/* Labels */}
                    <div className="absolute top-1 left-1 sm:top-2 sm:left-2 badge badge-xs sm:badge-sm badge-neutral text-xs z-10">
                      Original
                    </div>
                    <div className="absolute top-1 right-1 sm:top-2 sm:right-2 badge badge-xs sm:badge-sm badge-primary text-xs z-10">
                      Optimized
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-4 w-full mb-4">
                  {/* Original Image - simplified on mobile */}
                  <div className="bg-base-200 overflow-hidden rounded-lg">
                    <figure className="px-1 sm:px-2 pt-1 sm:pt-2">
                      <div className="rounded-lg overflow-hidden bg-base-200 w-full"
                        style={{
                          aspectRatio: originalDimensions ? `${originalDimensions.width}/${originalDimensions.height}` : '1/1',
                          minHeight: '120px',
                          maxHeight: '50vh'
                        }}>
                        <img
                          src={previewUrl}
                          alt="Original"
                          className="w-full h-full object-contain max-h-[50vh]"
                        />
                      </div>
                    </figure>
                    <div className="p-1 sm:p-2 text-center">
                      <h3 className="font-medium text-xs sm:text-sm">
                        Original
                      </h3>
                    </div>
                  </div>

                  {/* Optimized Image - simplified on mobile */}
                  <div className="bg-base-200 overflow-hidden rounded-lg">
                    <figure className="px-1 sm:px-2 pt-1 sm:pt-2">
                      <div className="rounded-lg overflow-hidden bg-base-200 w-full"
                        style={{
                          aspectRatio: originalDimensions ? `${originalDimensions.width}/${originalDimensions.height}` : '1/1',
                          minHeight: '120px',
                          maxHeight: '50vh'
                        }}>
                        <img
                          src={uploadedUrl}
                          alt="Optimized"
                          className="w-full h-full object-contain max-h-[50vh]"
                        />
                      </div>
                    </figure>
                    <div className="p-1 sm:p-2 text-center">
                      <h3 className="font-medium text-xs sm:text-sm">
                        Optimized
                      </h3>
                    </div>
                  </div>
                </div>
              )}

              {/* Download and copy section - more compact on mobile */}
              <div className="bg-base-100 shadow-sm sm:shadow-md rounded-lg mb-2 sm:mb-4 w-full">
                <div className="p-2 sm:p-4">
                  <h3 className="text-sm sm:text-base font-medium mb-2">Image URL</h3>
                  <div className="join w-full flex-col sm:flex-row">
                    <input
                      type="text"
                      className="input input-sm sm:input-md input-bordered join-item w-full font-mono text-xs mb-1 sm:mb-0"
                      value={uploadedUrl || ''}
                      readOnly
                    />
                    <button
                      type="button"
                      className="btn btn-sm sm:btn-md join-item btn-primary sm:w-auto w-full"
                      onClick={() => copyToClipboard(uploadedUrl || '')}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <title>Copy Image URL</title>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                      </svg>
                      Copy
                    </button>
                  </div>

                  <div className="flex justify-end gap-2 mt-3">
                    <button
                      type="button"
                      className="btn btn-sm sm:btn-md btn-outline gap-1"
                      onClick={() => window.open(uploadedUrl, '_blank')}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <title>Open Image</title>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      Open
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm sm:btn-md btn-primary gap-1"
                      onClick={handleDownloadImage}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <title>Download</title>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Toast notification */}
      {toast.visible && (
        <div className="toast toast-top toast-center">
          <div className="alert alert-info shadow-lg max-w-xs sm:max-w-md text-xs sm:text-sm">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-5 h-5 sm:w-6 sm:h-6"><title>Info</title><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <span>{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  )
}