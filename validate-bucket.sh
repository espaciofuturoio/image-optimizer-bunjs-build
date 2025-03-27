#!/bin/bash

# Check if bucket name is provided
if [ -z "$1" ]; then
    echo "Error: Please provide a bucket name"
    echo "Usage: ./validate-bucket.sh <bucket-name> [--domain=your-domain.com]"
    exit 1
fi

BUCKET_NAME=$1
DOMAIN_FLAG=$2
PROJECT_ID="naye-tours"
BACKEND_BUCKET_NAME="${BUCKET_NAME//_/-}-backend"
URL_MAP_NAME="${BUCKET_NAME//_/-}-urlmap"
HTTPS_PROXY_NAME="${BUCKET_NAME//_/-}-https-proxy"
HTTPS_FORWARDING_RULE_NAME="${BUCKET_NAME//_/-}-https-rule"
CERT_NAME="${BUCKET_NAME//_/-}-cert"

# Extract domain from flag if provided
CUSTOM_DOMAIN=""
if [[ $DOMAIN_FLAG == "--domain="* ]]; then
    CUSTOM_DOMAIN=${DOMAIN_FLAG#--domain=}
fi

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
        return 0
    else
        print_error "$2"
        return 1
    fi
}

# Function to validate and fix bucket IAM policy
validate_bucket_iam() {
    echo "Validating bucket IAM policy..."
    
    # Check if bucket has public access
    if ! gcloud storage buckets get-iam-policy gs://$BUCKET_NAME --format="get(bindings)" | grep -q "allUsers"; then
        print_warning "Public access not configured. Fixing..."
        gcloud storage buckets add-iam-policy-binding gs://$BUCKET_NAME \
            --member=allUsers \
            --role=roles/storage.objectViewer
        check_status "Public access configured" "Failed to configure public access"
    else
        print_success "Public access properly configured"
    fi
}

# Function to validate and fix bucket settings
validate_bucket_settings() {
    echo "Validating bucket settings..."
    
    # Check uniform bucket-level access
    if ! gcloud storage buckets describe gs://$BUCKET_NAME --format="get(iamConfiguration.uniformBucketLevelAccess.enabled)" | grep -q "True"; then
        print_warning "Uniform bucket-level access not enabled. Fixing..."
        gcloud storage buckets update gs://$BUCKET_NAME --uniform-bucket-level-access
        check_status "Uniform bucket-level access enabled" "Failed to enable uniform bucket-level access"
    else
        print_success "Uniform bucket-level access properly configured"
    fi

    # Check public access prevention
    if gcloud storage buckets describe gs://$BUCKET_NAME --format="get(iamConfiguration.publicAccessPrevention)" | grep -q "enforced"; then
        print_warning "Public access prevention enabled. Fixing..."
        gcloud storage buckets update gs://$BUCKET_NAME --no-public-access-prevention
        check_status "Public access prevention disabled" "Failed to disable public access prevention"
    else
        print_success "Public access prevention properly configured"
    fi
}

# Function to validate and fix backend bucket
validate_backend_bucket() {
    echo "Validating backend bucket..."
    
    if gcloud compute backend-buckets describe $BACKEND_BUCKET_NAME 2>/dev/null; then
        # Check if CDN is enabled
        if ! gcloud compute backend-buckets describe $BACKEND_BUCKET_NAME --format="get(enableCdn)" | grep -q "True"; then
            print_warning "CDN not enabled for backend bucket. Fixing..."
            gcloud compute backend-buckets update $BACKEND_BUCKET_NAME \
                --enable-cdn \
                --custom-response-header="Cache-Control: public, max-age=31536000, immutable" \
                --custom-response-header="Access-Control-Allow-Origin: *" \
                --custom-response-header="Strict-Transport-Security: max-age=31536000; includeSubDomains"
            check_status "CDN enabled for backend bucket" "Failed to enable CDN"
        else
            print_success "Backend bucket CDN properly configured"
        fi
    else
        print_warning "Backend bucket does not exist. Creating..."
        gcloud compute backend-buckets create $BACKEND_BUCKET_NAME \
            --gcs-bucket-name=$BUCKET_NAME \
            --enable-cdn
        check_status "Backend bucket created" "Failed to create backend bucket"
    fi
}

# Function to validate and fix URL map
validate_url_map() {
    echo "Validating URL map..."
    
    if gcloud compute url-maps describe $URL_MAP_NAME 2>/dev/null; then
        # Check if default backend is correct
        CURRENT_BACKEND=$(gcloud compute url-maps describe $URL_MAP_NAME --format="get(defaultService)")
        EXPECTED_BACKEND="backends/$BACKEND_BUCKET_NAME"
        if [[ "$CURRENT_BACKEND" != *"$EXPECTED_BACKEND" ]]; then
            print_warning "URL map default backend incorrect. Fixing..."
            gcloud compute url-maps set-default-service $URL_MAP_NAME \
                --default-backend-bucket=$BACKEND_BUCKET_NAME
            check_status "URL map default backend updated" "Failed to update URL map default backend"
        else
            print_success "URL map properly configured"
        fi
    else
        print_warning "URL map does not exist. Creating..."
        gcloud compute url-maps create $URL_MAP_NAME \
            --default-backend-bucket=$BACKEND_BUCKET_NAME
        check_status "URL map created" "Failed to create URL map"
    fi
}

# Function to validate and fix SSL certificate
validate_ssl_certificate() {
    echo "Validating SSL certificate..."
    
    if ! gcloud compute ssl-certificates describe $CERT_NAME 2>/dev/null; then
        print_warning "SSL certificate does not exist. Creating..."
        CERT_DOMAIN="${BUCKET_NAME//_/-}.storage.googleapis.com"
        if [ ! -z "$CUSTOM_DOMAIN" ]; then
            CERT_DOMAIN="$CERT_DOMAIN,$CUSTOM_DOMAIN"
        fi
        gcloud compute ssl-certificates create $CERT_NAME \
            --domains=$CERT_DOMAIN \
            --global
        check_status "SSL certificate created" "Failed to create SSL certificate"
    else
        print_success "SSL certificate exists"
        
        # Check if custom domain is included in certificate
        if [ ! -z "$CUSTOM_DOMAIN" ]; then
            current_domains=$(gcloud compute ssl-certificates describe $CERT_NAME --global --format="get(managed.domains)")
            if [[ ! "$current_domains" == *"$CUSTOM_DOMAIN"* ]]; then
                print_warning "Custom domain not in certificate. Adding..."
                new_domains="$current_domains,$CUSTOM_DOMAIN"
                gcloud compute ssl-certificates update $CERT_NAME \
                    --domains=$new_domains \
                    --global
                check_status "Custom domain added to certificate" "Failed to add custom domain to certificate"
            else
                print_success "Custom domain properly configured in certificate"
            fi
        fi
    fi
}

# Function to validate domain DNS configuration
validate_domain_dns() {
    if [ ! -z "$CUSTOM_DOMAIN" ]; then
        echo "Validating domain DNS configuration..."
        
        # Get the load balancer IP
        LOAD_BALANCER_IP=$(gcloud compute forwarding-rules describe $HTTPS_FORWARDING_RULE_NAME \
            --global \
            --format="get(IPAddress)")
        
        if [ ! -z "$LOAD_BALANCER_IP" ]; then
            # Check DNS resolution
            echo "Checking DNS resolution for $CUSTOM_DOMAIN..."
            DNS_IP=$(dig $CUSTOM_DOMAIN +short)
            
            if [ ! -z "$DNS_IP" ]; then
                if [ "$DNS_IP" == "$LOAD_BALANCER_IP" ]; then
                    print_success "DNS configuration is correct"
                else
                    print_warning "DNS configuration mismatch"
                    echo "Current DNS IP: $DNS_IP"
                    echo "Expected IP: $LOAD_BALANCER_IP"
                    echo -e "\n${YELLOW}⚠️  DNS Configuration Required:${NC}"
                    echo "Update your DNS A record:"
                    echo "  Type: A"
                    echo "  Name: $CUSTOM_DOMAIN"
                    echo "  Value: $LOAD_BALANCER_IP"
                    echo "  TTL: 3600 (or automatic)"
                fi
            else
                print_warning "No DNS record found for $CUSTOM_DOMAIN"
                echo -e "\n${YELLOW}⚠️  DNS Configuration Required:${NC}"
                echo "Add an A record to your DNS settings:"
                echo "  Type: A"
                echo "  Name: $CUSTOM_DOMAIN"
                echo "  Value: $LOAD_BALANCER_IP"
                echo "  TTL: 3600 (or automatic)"
            fi
        else
            print_error "Failed to get load balancer IP"
        fi
    fi
}

# Function to validate and fix HTTPS proxy
validate_https_proxy() {
    echo "Validating HTTPS proxy..."
    
    if gcloud compute target-https-proxies describe $HTTPS_PROXY_NAME 2>/dev/null; then
        # Check if URL map and SSL certificate are correct
        CURRENT_URL_MAP=$(gcloud compute target-https-proxies describe $HTTPS_PROXY_NAME --format="get(urlMap)")
        CURRENT_CERT=$(gcloud compute target-https-proxies describe $HTTPS_PROXY_NAME --format="get(sslCertificates)")
        
        if [[ "$CURRENT_URL_MAP" != *"$URL_MAP_NAME" ]] || [[ "$CURRENT_CERT" != *"$CERT_NAME" ]]; then
            print_warning "HTTPS proxy configuration incorrect. Fixing..."
            gcloud compute target-https-proxies update $HTTPS_PROXY_NAME \
                --url-map=$URL_MAP_NAME \
                --ssl-certificates=$CERT_NAME
            check_status "HTTPS proxy updated" "Failed to update HTTPS proxy"
        else
            print_success "HTTPS proxy properly configured"
        fi
    else
        print_warning "HTTPS proxy does not exist. Creating..."
        gcloud compute target-https-proxies create $HTTPS_PROXY_NAME \
            --url-map=$URL_MAP_NAME \
            --ssl-certificates=$CERT_NAME
        check_status "HTTPS proxy created" "Failed to create HTTPS proxy"
    fi
}

# Function to validate and fix forwarding rule
validate_forwarding_rule() {
    echo "Validating forwarding rule..."
    
    if gcloud compute forwarding-rules describe $HTTPS_FORWARDING_RULE_NAME --global 2>/dev/null; then
        # Check if target proxy is correct
        CURRENT_TARGET=$(gcloud compute forwarding-rules describe $HTTPS_FORWARDING_RULE_NAME --global --format="get(target)")
        if [[ "$CURRENT_TARGET" != *"$HTTPS_PROXY_NAME" ]]; then
            print_warning "Forwarding rule target incorrect. Fixing..."
            gcloud compute forwarding-rules delete $HTTPS_FORWARDING_RULE_NAME --global -q
            gcloud compute forwarding-rules create $HTTPS_FORWARDING_RULE_NAME \
                --global \
                --target-https-proxy=$HTTPS_PROXY_NAME \
                --ports=443
            check_status "Forwarding rule updated" "Failed to update forwarding rule"
        else
            print_success "Forwarding rule properly configured"
        fi
    else
        print_warning "Forwarding rule does not exist. Creating..."
        gcloud compute forwarding-rules create $HTTPS_FORWARDING_RULE_NAME \
            --global \
            --target-https-proxy=$HTTPS_PROXY_NAME \
            --ports=443
        check_status "Forwarding rule created" "Failed to create forwarding rule"
    fi
}

# Main validation process
echo "🔍 Starting bucket configuration validation..."

# Check if bucket exists
if ! gcloud storage buckets describe gs://$BUCKET_NAME &>/dev/null; then
    print_error "Bucket gs://$BUCKET_NAME does not exist!"
    exit 1
fi

# Run all validations
validate_bucket_iam
validate_bucket_settings
validate_backend_bucket
validate_url_map
validate_ssl_certificate
validate_https_proxy
validate_forwarding_rule
validate_domain_dns

# Get and display the load balancer IP
echo "Getting load balancer IP..."
LOAD_BALANCER_IP=$(gcloud compute forwarding-rules describe $HTTPS_FORWARDING_RULE_NAME \
    --global \
    --format="get(IPAddress)")

if [ ! -z "$LOAD_BALANCER_IP" ]; then
    print_success "Load balancer IP: $LOAD_BALANCER_IP"
    
    # Update .env file with CDN configuration
    echo "Updating .env file with CDN configuration..."
    
    # Create a temporary file
    TEMP_ENV=$(mktemp)
    
    # If .env exists, copy it to temp file
    if [ -f ".env" ]; then
        cp .env "$TEMP_ENV"
    fi
    
    # Update or add CDN_BASE_URL
    if grep -q "CDN_BASE_URL=" "$TEMP_ENV"; then
        # Update existing CDN_BASE_URL
        sed -i '' "s|CDN_BASE_URL=.*|CDN_BASE_URL=https://$LOAD_BALANCER_IP|" "$TEMP_ENV"
    else
        # Add new CDN_BASE_URL
        echo "CDN_BASE_URL=https://$LOAD_BALANCER_IP" >> "$TEMP_ENV"
    fi
    
    # Update or add other required variables if they don't exist
    if ! grep -q "GOOGLE_CLOUD_PROJECT_ID=" "$TEMP_ENV"; then
        echo "GOOGLE_CLOUD_PROJECT_ID=$PROJECT_ID" >> "$TEMP_ENV"
    fi
    if ! grep -q "GOOGLE_CLOUD_BUCKET_NAME=" "$TEMP_ENV"; then
        echo "GOOGLE_CLOUD_BUCKET_NAME=$BUCKET_NAME" >> "$TEMP_ENV"
    fi
    if ! grep -q "GOOGLE_CLOUD_KEY_FILE_PATH=" "$TEMP_ENV"; then
        echo "GOOGLE_CLOUD_KEY_FILE_PATH=$(pwd)/$KEY_FILE_PATH" >> "$TEMP_ENV"
    fi
    
    # Move temp file to .env
    mv "$TEMP_ENV" .env
    check_status "Environment file updated" "Failed to update environment file"
    
    # Display the contents of the .env file
    echo -e "\n${GREEN}Current .env file contents:${NC}"
    cat .env
else
    print_error "Failed to get load balancer IP"
fi

print_success "🎉 Bucket configuration validation completed!"

# Print summary
echo -e "\n${GREEN}📡 CDN Information:${NC}"
echo "----------------------------------------"
echo "Load Balancer IP: $LOAD_BALANCER_IP"
if [ ! -z "$CUSTOM_DOMAIN" ]; then
    echo "Custom Domain: https://$CUSTOM_DOMAIN"
fi
echo "CDN Base URL: https://$LOAD_BALANCER_IP"
echo "Example URLs:"
echo "  - Thumbnail: https://$LOAD_BALANCER_IP/rubenabix/thumbnail/{file_hash}"
echo "  - Full: https://$LOAD_BALANCER_IP/rubenabix/full/{file_hash}"
echo "  - Preview: https://$LOAD_BALANCER_IP/rubenabix/preview/{file_hash}"
echo "----------------------------------------"
echo -e "\n${YELLOW}⚠️  Note: If SSL certificate was just created, wait a few minutes for it to propagate${NC}"
echo -e "\n${YELLOW}ℹ️  Note: Replace {file_hash} with the actual file hash when using the URLs${NC}" 