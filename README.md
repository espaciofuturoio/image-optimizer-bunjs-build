# Image Optimizer with Bun.js

A high-performance image compression and optimization service built with Bun.js, React, and TypeScript.

## Tech Stack

- **Runtime & Bundler**: [Bun](https://bun.sh) - Fast JavaScript runtime and bundler
- **Frontend**: React 19 with TypeScript
- **Styling**: TailwindCSS 4 with [DaisyUI](https://daisyui.com/)
- **Image Processing**:
  - browser-image-compression
  - heic-convert
  - webp-converter-browser
- **Development**: TypeScript, hot module reloading
- **Deployment**: Docker-ready for production

## Features

- Optimizes images with minimal quality loss
- Supports multiple image formats including HEIC conversion
- Fast processing using Bun's performance advantages
- Modern UI with responsive design

## Development

```bash
# Install dependencies
bun install

# Start development server with hot reloading
bun run dev
```

## Building for Production

```bash
# Build the application
bun run build
```

## Docker Deployment

This application includes Docker configuration for easy deployment.

### Using Docker Compose

```bash
# Start the production service
docker-compose -f docker-compose.production.yml up -d
```

### Environment Variables

- `NODE_ENV` - Set to "production" for production builds
- `HOST` - Set to "0.0.0.0" for Docker compatibility

## Project Structure

- `src/` - Application source code
- `public/` - Static assets
- `dist/` - Production build output
- `uploads/` - Temporary storage for uploaded images
- `build.ts` - Custom build script using Bun's bundler

## Why Bun?

This project leverages Bun instead of traditional bundlers like Vite for several advantages:

- **Performance**: Significantly faster builds and hot reloading
- **All-in-one solution**: Bundler, runtime, and package manager in one tool
- **JSX/TSX support**: Native support without additional configuration
- **Reduced dependencies**: Fewer external tools and configurations needed
