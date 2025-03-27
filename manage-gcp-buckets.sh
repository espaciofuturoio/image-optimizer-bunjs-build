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

# Function to list storage buckets
list_storage_buckets() {
    echo "📦 Listing all storage buckets..."
    buckets=($(gcloud storage buckets list --format="value(name)"))
    if [ ${#buckets[@]} -eq 0 ]; then
        print_warning "No storage buckets found"
        return
    fi
    
    echo -e "\nAvailable storage buckets:"
    for i in "${!buckets[@]}"; do
        echo "$((i+1)). ${buckets[$i]}"
    done
    
    echo -e "\nSelect a bucket number to remove (or 'q' to quit):"
    read selection
    
    if [[ "$selection" == "q" ]]; then
        return
    fi
    
    if ! [[ "$selection" =~ ^[0-9]+$ ]] || [ "$selection" -lt 1 ] || [ "$selection" -gt ${#buckets[@]} ]; then
        print_error "Invalid selection"
        return
    fi
    
    selected_bucket="${buckets[$((selection-1))]}"
    echo -e "\nYou selected: $selected_bucket"
    
    # Confirm deletion
    echo -e "${RED}WARNING: This will permanently delete the bucket and all its contents!${NC}"
    echo "Type the bucket name to confirm deletion:"
    read confirmation
    
    if [ "$confirmation" != "$selected_bucket" ]; then
        print_error "Bucket name does not match. Operation cancelled."
        return
    fi
    
    echo "Removing bucket $selected_bucket..."
    if gcloud storage rm -r "gs://$selected_bucket" --quiet; then
        print_success "Storage bucket removed successfully"
    else
        print_error "Failed to remove storage bucket"
    fi
}

# Function to list backend buckets
list_backend_buckets() {
    echo "🔄 Listing all backend buckets..."
    backend_buckets=($(gcloud compute backend-buckets list --format="value(name)"))
    if [ ${#backend_buckets[@]} -eq 0 ]; then
        print_warning "No backend buckets found"
        return
    fi
    
    echo -e "\nAvailable backend buckets:"
    for i in "${!backend_buckets[@]}"; do
        echo "$((i+1)). ${backend_buckets[$i]}"
    done
    
    echo -e "\nSelect a backend bucket number to remove (or 'q' to quit):"
    read selection
    
    if [[ "$selection" == "q" ]]; then
        return
    fi
    
    if ! [[ "$selection" =~ ^[0-9]+$ ]] || [ "$selection" -lt 1 ] || [ "$selection" -gt ${#backend_buckets[@]} ]; then
        print_error "Invalid selection"
        return
    fi
    
    selected_backend="${backend_buckets[$((selection-1))]}"
    echo -e "\nYou selected: $selected_backend"
    
    # Confirm deletion
    echo -e "${RED}WARNING: This will permanently delete the backend bucket and its configuration!${NC}"
    echo "Type the backend bucket name to confirm deletion:"
    read confirmation
    
    if [ "$confirmation" != "$selected_backend" ]; then
        print_error "Backend bucket name does not match. Operation cancelled."
        return
    fi
    
    echo "Removing backend bucket $selected_backend..."
    if gcloud compute backend-buckets delete $selected_backend -q; then
        print_success "Backend bucket removed successfully"
    else
        print_error "Failed to remove backend bucket"
    fi
}

# Function to show bucket details
show_bucket_details() {
    echo "📊 Showing bucket details..."
    
    # List storage buckets with details
    echo -e "\n${GREEN}Storage Buckets:${NC}"
    gcloud storage buckets list --format="table(name,location,storageClass,uniformBucketLevelAccess.enabled,publicAccessPrevention)"
    
    # List backend buckets with details
    echo -e "\n${GREEN}Backend Buckets:${NC}"
    gcloud compute backend-buckets list --format="table(name,enableCdn,gcsBucketName)"
}

# Function to remove all resources
remove_all_resources() {
    echo -e "${RED}⚠️  WARNING: This will remove ALL storage and backend buckets and their associated resources!${NC}"
    echo "This operation cannot be undone."
    echo "Type 'DELETE ALL' to confirm:"
    read confirmation
    
    if [ "$confirmation" != "DELETE ALL" ]; then
        print_error "Confirmation does not match. Operation cancelled."
        return
    fi
    
    echo "Removing all resources..."
    
    # Remove all storage buckets
    echo -e "\n${YELLOW}Removing storage buckets...${NC}"
    storage_buckets=($(gcloud storage buckets list --format="value(name)"))
    for bucket in "${storage_buckets[@]}"; do
        echo "Removing storage bucket: $bucket"
        gcloud storage rm -r "gs://$bucket" --quiet
    done
    
    # Get all backend buckets
    backend_buckets=($(gcloud compute backend-buckets list --format="value(name)"))
    
    # For each backend bucket, remove associated resources first
    for backend in "${backend_buckets[@]}"; do
        echo -e "\n${YELLOW}Removing resources for backend bucket: $backend${NC}"
        
        # Get associated URL map name
        url_map_name="${backend%-backend}-urlmap"
        https_proxy_name="${backend%-backend}-https-proxy"
        forwarding_rule_name="${backend%-backend}-https-rule"
        
        # Remove forwarding rule if it exists
        if gcloud compute forwarding-rules describe $forwarding_rule_name --global &> /dev/null; then
            echo "Removing forwarding rule: $forwarding_rule_name"
            gcloud compute forwarding-rules delete $forwarding_rule_name --global -q
        fi
        
        # Remove HTTPS proxy if it exists
        if gcloud compute target-https-proxies describe $https_proxy_name --global &> /dev/null; then
            echo "Removing HTTPS proxy: $https_proxy_name"
            gcloud compute target-https-proxies delete $https_proxy_name --global -q
        fi
        
        # Remove URL map if it exists
        if gcloud compute url-maps describe $url_map_name --global &> /dev/null; then
            echo "Removing URL map: $url_map_name"
            gcloud compute url-maps delete $url_map_name --global -q
        fi
        
        # Finally, remove the backend bucket
        echo "Removing backend bucket: $backend"
        gcloud compute backend-buckets delete $backend -q
    done
    
    print_success "All resources removed successfully"
}

# Function to manage custom domains
manage_custom_domains() {
    echo "🌐 Custom Domain Management"
    echo "1. Add a custom domain"
    echo "2. List custom domains"
    echo "3. Remove a custom domain"
    echo "4. Check domain DNS configuration"
    echo "q. Back to main menu"
    echo "Choose an option:"
    read option

    case $option in
        1)
            echo "Enter the custom domain (e.g., cdn.yourdomain.com):"
            read domain
            
            # Get the current backend bucket
            echo "Select a backend bucket to add the domain to:"
            backend_buckets=($(gcloud compute backend-buckets list --format="value(name)"))
            for i in "${!backend_buckets[@]}"; do
                echo "$((i+1)). ${backend_buckets[$i]}"
            done
            read bucket_selection
            
            if [[ "$bucket_selection" =~ ^[0-9]+$ ]] && [ "$bucket_selection" -ge 1 ] && [ "$bucket_selection" -le ${#backend_buckets[@]} ]; then
                selected_bucket="${backend_buckets[$((bucket_selection-1))]}"
                
                # Get the current certificate name
                cert_name=$(gcloud compute ssl-certificates list --filter="name~${selected_bucket%-backend}-cert" --format="value(name)")
                
                if [ ! -z "$cert_name" ]; then
                    # Update the SSL certificate with the new domain
                    current_domains=$(gcloud compute ssl-certificates describe $cert_name --global --format="get(managed.domains)")
                    new_domains="$current_domains,$domain"
                    
                    echo "Updating SSL certificate with new domain..."
                    gcloud compute ssl-certificates update $cert_name \
                        --domains=$new_domains \
                        --global
                    
                    if [ $? -eq 0 ]; then
                        print_success "Domain added successfully"
                        echo -e "\n${YELLOW}⚠️  DNS Configuration Required:${NC}"
                        echo "Add an A record to your DNS settings:"
                        echo "  Type: A"
                        echo "  Name: $domain"
                        echo "  Value: $(gcloud compute forwarding-rules describe ${selected_bucket%-backend}-https-rule --global --format="get(IPAddress)")"
                        echo "  TTL: 3600 (or automatic)"
                    else
                        print_error "Failed to add domain"
                    fi
                else
                    print_error "SSL certificate not found for this backend bucket"
                fi
            else
                print_error "Invalid selection"
            fi
            ;;
        2)
            echo "Listing custom domains for all backend buckets..."
            backend_buckets=($(gcloud compute backend-buckets list --format="value(name)"))
            for bucket in "${backend_buckets[@]}"; do
                cert_name=$(gcloud compute ssl-certificates list --filter="name~${bucket%-backend}-cert" --format="value(name)")
                if [ ! -z "$cert_name" ]; then
                    echo -e "\n${GREEN}Backend Bucket: $bucket${NC}"
                    gcloud compute ssl-certificates describe $cert_name --global --format="table(name,managed.domains,managed.status)"
                fi
            done
            ;;
        3)
            echo "Select a backend bucket to remove domain from:"
            backend_buckets=($(gcloud compute backend-buckets list --format="value(name)"))
            for i in "${!backend_buckets[@]}"; do
                echo "$((i+1)). ${backend_buckets[$i]}"
            done
            read bucket_selection
            
            if [[ "$bucket_selection" =~ ^[0-9]+$ ]] && [ "$bucket_selection" -ge 1 ] && [ "$bucket_selection" -le ${#backend_buckets[@]} ]; then
                selected_bucket="${backend_buckets[$((bucket_selection-1))]}"
                cert_name=$(gcloud compute ssl-certificates list --filter="name~${selected_bucket%-backend}-cert" --format="value(name)")
                
                if [ ! -z "$cert_name" ]; then
                    current_domains=$(gcloud compute ssl-certificates describe $cert_name --global --format="get(managed.domains)")
                    echo "Current domains:"
                    echo $current_domains | tr ',' '\n' | nl
                    
                    echo "Enter the number of the domain to remove:"
                    read domain_selection
                    
                    if [[ "$domain_selection" =~ ^[0-9]+$ ]]; then
                        domains_array=($(echo $current_domains | tr ',' ' '))
                        if [ "$domain_selection" -ge 1 ] && [ "$domain_selection" -le ${#domains_array[@]} ]; then
                            domain_to_remove="${domains_array[$((domain_selection-1))]}"
                            new_domains=$(echo $current_domains | sed "s/$domain_to_remove,//" | sed "s/,$domain_to_remove//" | sed "s/$domain_to_remove//")
                            
                            echo "Updating SSL certificate..."
                            gcloud compute ssl-certificates update $cert_name \
                                --domains=$new_domains \
                                --global
                            
                            if [ $? -eq 0 ]; then
                                print_success "Domain removed successfully"
                            else
                                print_error "Failed to remove domain"
                            fi
                        else
                            print_error "Invalid domain selection"
                        fi
                    else
                        print_error "Invalid input"
                    fi
                else
                    print_error "SSL certificate not found for this backend bucket"
                fi
            else
                print_error "Invalid selection"
            fi
            ;;
        4)
            echo "Enter the domain to check:"
            read domain
            
            echo "Checking DNS configuration for $domain..."
            echo "Running dig command..."
            dig $domain +short
            
            echo -e "\nChecking SSL certificate status..."
            cert_name=$(gcloud compute ssl-certificates list --filter="managed.domains:$domain" --format="value(name)")
            if [ ! -z "$cert_name" ]; then
                gcloud compute ssl-certificates describe $cert_name --global --format="table(name,managed.domains,managed.status)"
            else
                print_error "No SSL certificate found for this domain"
            fi
            ;;
        q)
            return
            ;;
        *)
            print_error "Invalid option"
            ;;
    esac
    
    echo -e "\nPress Enter to continue..."
    read
}

# Main menu
while true; do
    echo -e "\n🚀 GCP Bucket Manager"
    echo "1. List and manage storage buckets"
    echo "2. List and manage backend buckets"
    echo "3. Show detailed bucket information"
    echo "4. Remove ALL resources (⚠️  DANGEROUS)"
    echo "5. Manage custom domains"
    echo "q. Quit"
    echo "Choose an option:"
    read option

    case $option in
        1)
            list_storage_buckets
            ;;
        2)
            list_backend_buckets
            ;;
        3)
            show_bucket_details
            ;;
        4)
            remove_all_resources
            ;;
        5)
            manage_custom_domains
            ;;
        q)
            echo "Exiting..."
            exit 0
            ;;
        *)
            print_error "Invalid option"
            ;;
    esac
    
    echo -e "\nPress Enter to continue..."
    read
done 