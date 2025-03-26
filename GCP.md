# Google Cloud Storage Setup Script

## Prerequisites
```bash
# Install Google Cloud SDK
brew install --cask google-cloud-sdk

# Login to Google Cloud
gcloud auth login

# Set the project
gcloud config set project naye-tours
```

## Create and Configure Bucket
```bash
# Create bucket with uniform access
gcloud storage buckets create gs://tinypic \
  --location=us-central1 \
  --uniform-bucket-level-access \
  --default-storage-class=STANDARD \
  --project=naye-tours

# Clear any previous access settings
gcloud storage buckets update gs://tinypic \
  --uniform-bucket-level-access \
  --clear-pap

# Make bucket publicly readable
gcloud storage buckets add-iam-policy-binding gs://tinypic \
  --member=allUsers \
  --role=roles/storage.objectViewer

# Create service account for application access
gcloud iam service-accounts create real-estate-services \
  --display-name="Real Estate Services Account" \
  --description="Service account for real estate image processing"

# Grant service account necessary permissions
gcloud storage buckets add-iam-policy-binding gs://tinypic \
  --member="serviceAccount:real-estate-services@naye-tours.iam.gserviceaccount.com" \
  --role="roles/storage.objectCreator"

gcloud storage buckets add-iam-policy-binding gs://tinypic \
  --member="serviceAccount:real-estate-services@naye-tours.iam.gserviceaccount.com" \
  --role="roles/storage.objectViewer"

# Generate service account key
gcloud iam service-accounts keys create storage-service-account.json \
  --iam-account=real-estate-services@naye-tours.iam.gserviceaccount.com

# Move the key file to the project
mv storage-service-account.json src/utils/

# Verify bucket settings
gcloud storage buckets describe gs://tinypic

# Test bucket access
curl -I https://storage.googleapis.com/tinypic/test.txt
```

## Environment Setup
Add the following to your `.env` file:
```env
GOOGLE_CLOUD_PROJECT_ID=naye-tours
GOOGLE_CLOUD_BUCKET_NAME=tinypic
GOOGLE_CLOUD_KEY_FILE_PATH=/path/to/your/project/src/utils/storage-service-account.json
```

## Bucket Configuration Details
- Location: us-central1
- Storage Class: STANDARD
- Access: Uniform bucket-level access
- Public Access: Read-only for all users
- Service Account: real-estate-services@naye-tours.iam.gserviceaccount.com

## Security Notes
1. Keep the service account key file secure and never commit it to version control
2. The bucket is publicly readable but only writable by the service account
3. Use environment variables for sensitive configuration
4. Consider setting up bucket lifecycle rules for cost management

## Troubleshooting
If you encounter permission issues:
1. Verify service account permissions:
```bash
gcloud storage buckets get-iam-policy gs://tinypic
```

2. Check service account status:
```bash
gcloud iam service-accounts describe real-estate-services@naye-tours.iam.gserviceaccount.com
```

3. Test bucket access:
```bash
# Test read access
curl -I https://storage.googleapis.com/tinypic/test.txt

# Test write access (requires authentication)
gcloud storage cp test.txt gs://tinypic/
```
## Script

```
chmod +x setup-gcp-bucket.sh
gcloud compute backend-buckets delete reality-one-v3-backend
```