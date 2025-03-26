# Install Google Cloud SDK
brew install --cask google-cloud-sdk

# Login to Google Cloud
gcloud auth login

# Set the project
gcloud config set project naye-tours

# Create bucket with uniform access
gcloud storage buckets create gs://tinypic --location=us-central1 --uniform-bucket-level-access

# Clear any previous access settings
gcloud storage buckets update gs://tinypic --uniform-bucket-level-access --clear-pap

# Make bucket publicly readable
gcloud storage buckets add-iam-policy-binding gs://tinypic --member=allUsers --role=roles/storage.objectViewer

# Verify bucket settings
gcloud storage buckets describe gs://tinypic

# Check if image is accessible
curl -I https://storage.googleapis.com/tinypic/your-image-path.jpeg

```