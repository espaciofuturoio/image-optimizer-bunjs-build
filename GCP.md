```

gcloud --version

brew install --cask google-cloud-sdk

gcloud auth login

gcloud config set project naye-tours

gcloud storage buckets create gs://tinypic --location=us-central1 --uniform-bucket-level-access

gcloud storage buckets update gs://tinypic --uniform-bucket-level-access --clear-pap

gcloud storage buckets add-iam-policy-binding gs://tinypic --member=allUsers --role=roles/storage.objectViewer

```