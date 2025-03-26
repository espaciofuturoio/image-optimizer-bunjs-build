#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Function to check command status
check_status() {
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ $1${NC}"
    else
        echo -e "${RED}❌ $2${NC}"
        exit 1
    fi
}

# Get project ID
PROJECT_ID=$(gcloud config get-value project)
if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}❌ No project ID set. Please run: gcloud config set project YOUR_PROJECT_ID${NC}"
    exit 1
fi

# Get load balancer IP
LOAD_BALANCER_IP=$(gcloud compute forwarding-rules describe reality-one-https-rule --global --format="get(IPAddress)")
if [ -z "$LOAD_BALANCER_IP" ]; then
    echo -e "${RED}❌ Could not get load balancer IP. Make sure the load balancer exists.${NC}"
    exit 1
fi

echo -e "${GREEN}📊 Setting up monitoring for CDN...${NC}"

# Enable Cloud Monitoring
echo "Enabling Cloud Monitoring..."
gcloud services enable monitoring.googleapis.com
check_status "Cloud Monitoring enabled" "Failed to enable Cloud Monitoring"

# Create monitoring dashboard for CDN metrics
echo "Creating monitoring dashboard..."
cat > dashboard.json << 'EOL'
{
    "displayName": "CDN Performance Dashboard",
    "gridLayout": {
        "columns": "2",
        "widgets": [
            {
                "title": "CDN Request Count",
                "xyChart": {
                    "dataSets": [{
                        "timeSeriesQuery": {
                            "timeSeriesFilter": {
                                "filter": "metric.type=\"compute.googleapis.com/backend/request_count\"",
                                "aggregation": {
                                    "alignmentPeriod": "3600s",
                                    "perSeriesAligner": "ALIGN_RATE"
                                }
                            }
                        }
                    }]
                }
            },
            {
                "title": "CDN Latency",
                "xyChart": {
                    "dataSets": [{
                        "timeSeriesQuery": {
                            "timeSeriesFilter": {
                                "filter": "metric.type=\"compute.googleapis.com/backend/latency\"",
                                "aggregation": {
                                    "alignmentPeriod": "3600s",
                                    "perSeriesAligner": "ALIGN_MEAN"
                                }
                            }
                        }
                    }]
                }
            }
        ]
    }
}
EOL

gcloud monitoring dashboards create \
    --project=$PROJECT_ID \
    --config-from-file=dashboard.json
check_status "Monitoring dashboard created" "Failed to create monitoring dashboard"

# Clean up temporary file
rm dashboard.json

# Create uptime check for CDN health
echo "Creating uptime check..."
gcloud monitoring uptime create "CDN Health Check" \
    --project=$PROJECT_ID \
    --resource-type=uptime-url \
    --resource-labels="host=$LOAD_BALANCER_IP,project_id=$PROJECT_ID" \
    --period=5 \
    --timeout=10 \
    --port=443 \
    --path="/" \
    --protocol=https
check_status "Uptime check created" "Failed to create uptime check"

# Clean up temporary file
rm uptime-config.json

print_success "🎉 Monitoring setup completed successfully!"

# Print Monitoring Information
echo -e "\n${GREEN}📊 Monitoring Information:${NC}"
echo "----------------------------------------"
echo "Project ID: $PROJECT_ID"
echo "Load Balancer IP: $LOAD_BALANCER_IP"
echo "Dashboard: CDN Performance Dashboard"
echo "Uptime Check: CDN Health Check"
echo "----------------------------------------"
echo -e "\n${YELLOW}⚠️  Note: Wait a few minutes for monitoring to start collecting data${NC}"

# Print how to view monitoring
echo -e "\n${GREEN}🔍 How to view monitoring:${NC}"
echo "1. Open Google Cloud Console: https://console.cloud.google.com/monitoring"
echo "2. Select project: $PROJECT_ID"
echo "3. View dashboards and uptime checks" 