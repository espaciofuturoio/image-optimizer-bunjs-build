#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check if a custom domain is provided
CUSTOM_DOMAIN=""
if [[ "$1" == "--domain="* ]]; then
    CUSTOM_DOMAIN=${1#--domain=}
fi

# Function to check command status
check_status() {
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ $1${NC}"
    else
        echo -e "${RED}❌ $2${NC}"
        exit 1
    fi
}

# Print success message
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

# Get project ID
PROJECT_ID=$(gcloud config get-value project)
if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}❌ No project ID set. Please run: gcloud config set project YOUR_PROJECT_ID${NC}"
    exit 1
fi

# Get load balancer IP
LOAD_BALANCER_IP=$(gcloud compute forwarding-rules describe reality-one-v8-https-rule --global --format="get(IPAddress)")
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
cat > dashboard.json << EOL
{
    "displayName": "CDN Performance Dashboard",
    "gridLayout": {
        "columns": "2",
        "widgets": [
            {
                "title": "HTTP/S Load Balancer Request Count",
                "xyChart": {
                    "dataSets": [{
                        "timeSeriesQuery": {
                            "timeSeriesFilter": {
                                "filter": "metric.type=\"loadbalancing.googleapis.com/https/request_count\" resource.type=\"https_lb_rule\"",
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
                "title": "HTTP/S Load Balancer Total Latency",
                "xyChart": {
                    "dataSets": [{
                        "timeSeriesQuery": {
                            "timeSeriesFilter": {
                                "filter": "metric.type=\"loadbalancing.googleapis.com/https/total_latencies\" resource.type=\"https_lb_rule\"",
                                "aggregation": {
                                    "alignmentPeriod": "3600s",
                                    "perSeriesAligner": "ALIGN_PERCENTILE_95"
                                }
                            }
                        }
                    }]
                }
            },
            {
                "title": "HTTP/S Load Balancer Response Size",
                "xyChart": {
                    "dataSets": [{
                        "timeSeriesQuery": {
                            "timeSeriesFilter": {
                                "filter": "metric.type=\"loadbalancing.googleapis.com/https/response_bytes_count\" resource.type=\"https_lb_rule\"",
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
                "title": "HTTP/S Load Balancer Frontend RTT",
                "xyChart": {
                    "dataSets": [{
                        "timeSeriesQuery": {
                            "timeSeriesFilter": {
                                "filter": "metric.type=\"loadbalancing.googleapis.com/https/frontend_tcp_rtt\" resource.type=\"https_lb_rule\"",
                                "aggregation": {
                                    "alignmentPeriod": "3600s",
                                    "perSeriesAligner": "ALIGN_PERCENTILE_95"
                                }
                            }
                        }
                    }]
                }
            },
            {
                "title": "HTTP/S Status Codes",
                "xyChart": {
                    "dataSets": [{
                        "timeSeriesQuery": {
                            "timeSeriesFilter": {
                                "filter": "metric.type=\"loadbalancing.googleapis.com/https/request_count\" resource.type=\"https_lb_rule\"",
                                "aggregation": {
                                    "alignmentPeriod": "3600s",
                                    "perSeriesAligner": "ALIGN_RATE",
                                    "crossSeriesReducer": "REDUCE_SUM",
                                    "groupByFields": [
                                        "metric.label.response_code_class"
                                    ]
                                }
                            }
                        },
                        "plotType": "STACKED_BAR"
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

# Create uptime check for CDN health via IP address
echo "Creating uptime check for CDN IP..."
gcloud monitoring uptime create "CDN-IP-Health-Check" \
    --project=$PROJECT_ID \
    --resource-type=uptime-url \
    --resource-labels="host=$LOAD_BALANCER_IP,project_id=$PROJECT_ID" \
    --period=5 \
    --timeout=10 \
    --port=443 \
    --path="/" \
    --protocol=https
check_status "IP uptime check created" "Failed to create IP uptime check"

# Create uptime check for CDN health via custom domain if provided
if [ ! -z "$CUSTOM_DOMAIN" ]; then
    echo "Creating uptime check for custom domain..."
    gcloud monitoring uptime create "CDN-Domain-Health-Check" \
        --project=$PROJECT_ID \
        --resource-type=uptime-url \
        --resource-labels="host=$CUSTOM_DOMAIN,project_id=$PROJECT_ID" \
        --period=5 \
        --timeout=10 \
        --port=443 \
        --path="/" \
        --protocol=https
    check_status "Domain uptime check created" "Failed to create domain uptime check"
fi

# Create notification channels
echo "Creating email notification channel..."
EMAIL=$(gcloud config get-value account)
DISPLAY_NAME="CDN Monitoring Alerts"

# Create notification channel
echo "Creating notification channel..."
CHANNEL_ID=$(gcloud alpha monitoring channels create \
    --display-name="$DISPLAY_NAME" \
    --description="Email notifications for CDN alerts" \
    --type=email \
    --channel-labels="email_address=$EMAIL" \
    --format="get(name)")

if [ ! -z "$CHANNEL_ID" ]; then
    print_success "Notification channel created"
else
    print_warning "Could not create notification channel. Alerts will not send notifications."
fi

print_success "🎉 Monitoring setup completed successfully!"

# Print Monitoring Information
echo -e "\n${GREEN}📊 Monitoring Information:${NC}"
echo "----------------------------------------"
echo "Project ID: $PROJECT_ID"
echo "Load Balancer IP: $LOAD_BALANCER_IP"
if [ ! -z "$CUSTOM_DOMAIN" ]; then
    echo "Custom Domain: $CUSTOM_DOMAIN"
fi
echo "Dashboard: CDN Performance Dashboard"
echo "Uptime Checks:"
echo "  - CDN-IP-Health-Check (via IP)"
if [ ! -z "$CUSTOM_DOMAIN" ]; then
    echo "  - CDN-Domain-Health-Check (via domain)"
fi
echo "----------------------------------------"
echo -e "\n${YELLOW}⚠️  Note: Wait a few minutes for monitoring to start collecting data${NC}"
echo -e "\n${YELLOW}ℹ️  For alerts: Use the Cloud Console to set up alerts based on the uptime checks${NC}"

# Print how to view monitoring
echo -e "\n${GREEN}🔍 How to view monitoring:${NC}"
echo "1. Open Google Cloud Console: https://console.cloud.google.com/monitoring"
echo "2. Select project: $PROJECT_ID"
echo "3. View dashboards and uptime checks"
echo -e "\n${GREEN}📈 CDN Metrics Explained:${NC}"
echo "- Request Count: Number of requests processed by the CDN"
echo "- Total Latency: Time taken to serve content (lower is better)"
echo "- Response Size: Amount of data transferred per request"
echo "- Frontend RTT: Round-trip time between client and CDN"
echo "- Status Codes: Distribution of HTTP response codes (200=success, 404=not found, etc.)"

echo -e "\n${GREEN}🔔 Setting Up Alert Policies:${NC}"
echo "1. Go to Google Cloud Console: https://console.cloud.google.com/monitoring/alerting"
echo "2. Click 'Create Policy'"
echo "3. Select a metric (e.g., uptime check, latency)"
echo "4. Set threshold conditions"
echo "5. Configure notifications"
echo "6. Name your policy and save" 