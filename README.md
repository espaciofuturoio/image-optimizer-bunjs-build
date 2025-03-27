# Image Optimizer with Bun.js

A high-performance image compression and optimization service built with Bun.js, React, and TypeScript.

<div align="center">
  <img src="https://github.com/espaciofuturoio/image-optimizer-bunjs-build/blob/main/DEMO.gif" alt="Video demostration">
</div>

[Live Demo](https://tinypic.rubenabix.com/)

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

## Prerequisites

- BunJS installed
- Google Cloud Platform account
- Google Cloud SDK installed
- Playwright installed

## Setup

1. Clone the repository
2. Install dependencies:
```bash
bun install
```

3. Set up Google Cloud credentials:
```bash
# Login to Google Cloud
gcloud auth login

# Set your project
gcloud config set project YOUR_PROJECT_ID
```

4. Create a new bucket using the setup script:
```bash
./setup-gcp-bucket.sh <bucket-name>
```

## Managing GCP Buckets

The project includes utility scripts to manage Google Cloud Storage buckets and CDN configuration:

### 1. Setup Bucket with CDN
```bash
./setup-gcp-bucket.sh <bucket-name> [--delete] [--force] [--domain=your-domain.com]
```

Options:
- `--delete`: Delete existing resources before setup
- `--force`: Force recreation of existing resources
- `--domain`: Configure a custom domain for the CDN

### 2. Manage Buckets and Domains
```bash
./manage-gcp-buckets.sh
```

This script provides the following options:
1. List and manage storage buckets
2. List and manage backend buckets
3. Show detailed bucket information
4. Remove ALL resources (⚠️ DANGEROUS)
5. Manage custom domains

### 3. Validate Bucket Configuration
```bash
./validate-bucket.sh <bucket-name> [--domain=your-domain.com]
```

This script validates and fixes:
- Bucket IAM permissions
- Bucket settings
- CDN configuration
- SSL certificates
- DNS configuration
- Custom domain setup

## Domain Management

### Setting Up Custom Domains

1. During initial setup:
```bash
./setup-gcp-bucket.sh your-bucket-name --domain=cdn.yourdomain.com
```

2. For existing buckets:
```bash
./manage-gcp-buckets.sh
```
Then select option 5 to:
- Add new domains
- List existing domains
- Remove domains
- Check DNS configuration

### DNS Configuration

When setting up a custom domain, you'll need to:

1. Add an A record to your DNS settings:
   ```
   Type: A
   Name: cdn.yourdomain.com
   Value: <load-balancer-ip>
   TTL: 3600 (or automatic)
   ```

2. Wait for DNS propagation (usually 5-15 minutes)

3. Wait for SSL certificate provisioning (up to 30 minutes)

### Domain Validation

To validate your domain configuration:
```bash
./validate-bucket.sh your-bucket-name --domain=cdn.yourdomain.com
```

This will check:
- DNS configuration
- SSL certificate status
- CDN setup
- Domain propagation

### Troubleshooting Domains

Common issues and solutions:

1. **SSL Certificate Issues**
   - Wait up to 30 minutes for certificate provisioning
   - Check certificate status in Cloud Console
   - Verify domain ownership

2. **DNS Issues**
   - Verify A record configuration
   - Check DNS propagation (can take 5-15 minutes)
   - Ensure domain matches SSL certificate

3. **CDN Issues**
   - Verify backend bucket configuration
   - Check URL map settings
   - Validate forwarding rules

## Environment Variables

Create a `.env` file with the following variables:
```env
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_CLOUD_BUCKET_NAME=your-bucket-name
GOOGLE_CLOUD_KEY_FILE_PATH=path/to/your/service-account-key.json
```

# GCP Bucket with CDN Setup

This script automates the setup of a Google Cloud Storage bucket with Cloud CDN for optimal image delivery performance.

## Features

- Automated GCP bucket creation with proper permissions
- Cloud CDN setup for low latency content delivery
- HTTPS support with SSL certificates
- Global edge caching
- Performance monitoring
- Service account management
- Security best practices

## Prerequisites

- Google Cloud SDK installed
- Authenticated with Google Cloud (`gcloud auth login`)
- Appropriate permissions in your GCP project

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd <repository-name>
```

2. Make the script executable:
```bash
chmod +x setup-gcp-bucket.sh
```

## Usage

### Basic Setup
```bash
./setup-gcp-bucket.sh <bucket-name>
```

### Delete Existing Resources and Setup New
```bash
./setup-gcp-bucket.sh <bucket-name> --delete
```

## Low Latency Configuration

The setup includes several optimizations for low latency content delivery:

### 1. Global Edge Caching
- Content cached at Google's edge locations worldwide
- Users served from nearest edge location
- 50-80% latency reduction compared to direct bucket access
- Automatic failover and health checking

### 2. Cache Optimization
- Long-term caching (1 year) for static content
- Immutable cache policy
- Stale-while-revalidate strategy
- Optimized Cache-Control headers

### 3. Compression
- Gzip compression for text-based content
- Automatic image optimization
- 60-80% size reduction for text
- 20-40% size reduction for images

### 4. Load Balancing
- Global load balancing
- Intelligent request routing
- Automatic failover
- Health checking

### 5. Performance Monitoring
- Real-time latency tracking
- Request count monitoring
- Cache hit ratio tracking
- Automatic optimization

## Performance Metrics

### Expected Improvements

1. **Latency**
   - Direct bucket access: 100-300ms
   - CDN access: 20-50ms
   - Improvement: 80% faster

2. **Throughput**
   - Direct bucket: Limited by single location
   - CDN: Distributed across global edge network
   - Improvement: 10x+ higher concurrent requests

3. **Cost Efficiency**
   - Reduced bandwidth usage
   - Lower origin server load
   - Better resource utilization

## Security Features

- HTTPS enabled by default
- SSL certificate configuration
- HSTS enabled
- CORS configured
- Secure headers
- Service account with minimal permissions

## Environment Variables

The script creates a `.env` file with:
```bash
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_CLOUD_BUCKET_NAME=your-bucket-name
GOOGLE_CLOUD_KEY_FILE_PATH=path/to/your/key.json
```

## Next Steps

1. Add `.env` to your `.gitignore`
2. Keep service account key secure
3. Set up bucket lifecycle rules
4. Configure DNS for custom domain
5. Test CDN URL
6. Monitor performance in Cloud Console
7. Wait for SSL certificate (up to 24 hours)

## Troubleshooting

### Common Issues

1. **Service Account Propagation**
   - Wait 10-15 seconds after creation
   - Retry permission assignments

2. **SSL Certificate**
   - Takes up to 24 hours to provision
   - Check certificate status in Cloud Console

3. **CDN Configuration**
   - Wait 5-10 minutes for changes to propagate
   - Monitor cache hit rates

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
