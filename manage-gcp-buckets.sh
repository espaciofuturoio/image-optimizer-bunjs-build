#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print success messages
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

# Function to print error messages
print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Function to print warning messages
print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Function to check if a command succeeded
check_status() {
    if [ $? -eq 0 ]; then
        print_success "$1"
    else
        print_error "$2"
        exit 1
    fi
}

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    print_error "gcloud CLI is not installed. Please install it first:"
    echo "brew install --cask google-cloud-sdk"
    exit 1
fi

# Check if user is logged in
if ! gcloud auth list --filter=status:ACTIVE --format="get(account)" &> /dev/null; then
    print_error "Not logged in to Google Cloud. Please run:"
    echo "gcloud auth login"
    exit 1
fi

# Function to list buckets
list_buckets() {
    echo "📦 Listing all buckets..."
    buckets=($(gcloud storage buckets list --format="value(name)"))
    if [ ${#buckets[@]} -eq 0 ]; then
        print_warning "No buckets found"
        exit 0
    fi
    
    echo -e "\nAvailable buckets:"
    for i in "${!buckets[@]}"; do
        echo "$((i+1)). ${buckets[$i]}"
    done
    
    echo -e "\nSelect a bucket number to remove (or 'q' to quit):"
    read selection
    
    if [[ "$selection" == "q" ]]; then
        echo "Exiting..."
        exit 0
    fi
    
    if ! [[ "$selection" =~ ^[0-9]+$ ]] || [ "$selection" -lt 1 ] || [ "$selection" -gt ${#buckets[@]} ]; then
        print_error "Invalid selection"
        exit 1
    fi
    
    selected_bucket="${buckets[$((selection-1))]}"
    echo -e "\nYou selected: $selected_bucket"
    
    # Confirm deletion
    echo -e "${RED}WARNING: This will permanently delete the bucket and all its contents!${NC}"
    echo "Type the bucket name to confirm deletion:"
    read confirmation
    
    if [ "$confirmation" != "$selected_bucket" ]; then
        print_error "Bucket name does not match. Operation cancelled."
        exit 1
    fi
    
    echo "Removing bucket $selected_bucket..."
    if gcloud storage rm -r "gs://$selected_bucket" --quiet; then
        print_success "Bucket removed successfully"
    else
        print_error "Failed to remove bucket"
        exit 1
    fi
}

# Main menu
echo "🚀 GCP Bucket Manager"
echo "1. List and remove buckets"
echo "q. Quit"
echo "Choose an option:"
read option

case $option in
    1)
        list_buckets
        ;;
    q)
        echo "Exiting..."
        exit 0
        ;;
    *)
        print_error "Invalid option"
        exit 1
        ;;
esac 