#!/bin/bash

# Solace Decrypt Service Test Script
# This script demonstrates the end-to-end flow of the enclave-style decryption service

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SAMPLE_DATA_FILE="$SCRIPT_DIR/sample-data/test-blob.txt"
TEST_BLOB_KEY="test-encrypted-blob-$(date +%s)"

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    if ! command_exists aws; then
        print_error "AWS CLI is not installed. Please install it first."
        exit 1
    fi
    
    if ! command_exists jq; then
        print_error "jq is not installed. Please install it first."
        exit 1
    fi
    
    # Check AWS credentials
    if ! aws sts get-caller-identity >/dev/null 2>&1; then
        print_error "AWS credentials are not configured. Please run 'aws configure' first."
        exit 1
    fi
    
    print_success "Prerequisites check passed"
}

# Get infrastructure outputs
get_infrastructure_outputs() {
    print_status "Getting infrastructure outputs..."
    
    cd "$SCRIPT_DIR/infra"
    
    if [ ! -f ".terraform/terraform.tfstate" ]; then
        print_error "Terraform state not found. Please run 'terraform apply' first."
        exit 1
    fi
    
    # Get outputs
    API_URL=$(terraform output -raw api_gateway_url 2>/dev/null || echo "")
    S3_BUCKET=$(terraform output -raw s3_bucket_name 2>/dev/null || echo "")
    KMS_KEY_ID=$(terraform output -raw kms_key_id 2>/dev/null || echo "")
    
    if [ -z "$API_URL" ] || [ -z "$S3_BUCKET" ] || [ -z "$KMS_KEY_ID" ]; then
        print_error "Failed to get infrastructure outputs. Please ensure terraform apply completed successfully."
        exit 1
    fi
    
    print_success "Infrastructure outputs retrieved"
    print_status "API URL: $API_URL"
    print_status "S3 Bucket: $S3_BUCKET"
    print_status "KMS Key ID: $KMS_KEY_ID"
}

# Create sample data
create_sample_data() {
    print_status "Creating sample data..."
    
    mkdir -p "$SCRIPT_DIR/sample-data"
    
    cat > "$SAMPLE_DATA_FILE" << EOF
This is a sample encrypted blob for testing the Solace decrypt service.
It contains sensitive information that should be encrypted at rest and
only decrypted within the secure Lambda environment.

Timestamp: $(date)
Test ID: $(uuidgen 2>/dev/null || echo "test-$(date +%s)")
EOF
    
    print_success "Sample data created at $SAMPLE_DATA_FILE"
}

# Encrypt and upload test blob
encrypt_and_upload() {
    print_status "Encrypting and uploading test blob..."
    
    # Read sample data
    PLAINTEXT=$(cat "$SAMPLE_DATA_FILE")
    
    # Encrypt with KMS
    print_status "Encrypting data with KMS..."
    ENCRYPTED_DATA=$(aws kms encrypt \
        --key-id "$KMS_KEY_ID" \
        --plaintext "$(echo -n "$PLAINTEXT" | base64)" \
        --query 'CiphertextBlob' \
        --output text)
    
    # Decode base64 and save to temporary file
    echo "$ENCRYPTED_DATA" | base64 -d > /tmp/encrypted-blob
    
    # Upload to S3
    print_status "Uploading encrypted blob to S3..."
    aws s3 cp /tmp/encrypted-blob "s3://$S3_BUCKET/$TEST_BLOB_KEY"
    
    # Clean up temporary file
    rm -f /tmp/encrypted-blob
    
    print_success "Test blob uploaded successfully"
    print_status "Blob key: $TEST_BLOB_KEY"
}

# Test the decryption service
test_decryption_service() {
    print_status "Testing decryption service..."
    
    # Prepare request payload
    REQUEST_PAYLOAD=$(jq -n --arg blobKey "$TEST_BLOB_KEY" '{blobKey: $blobKey}')
    
    print_status "Sending request to: $API_URL"
    print_status "Request payload: $REQUEST_PAYLOAD"
    
    # Make API call
    RESPONSE=$(curl -s -w "\n%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "$REQUEST_PAYLOAD" \
        "$API_URL")
    
    # Extract status code and body
    HTTP_STATUS=$(echo "$RESPONSE" | tail -n1)
    RESPONSE_BODY=$(echo "$RESPONSE" | head -n -1)
    
    print_status "Response status: $HTTP_STATUS"
    print_status "Response body: $RESPONSE_BODY"
    
    if [ "$HTTP_STATUS" -eq 200 ]; then
        DECRYPTED_TEXT=$(echo "$RESPONSE_BODY" | jq -r '.plaintext')
        ORIGINAL_TEXT=$(cat "$SAMPLE_DATA_FILE")
        
        if [ "$DECRYPTED_TEXT" = "$ORIGINAL_TEXT" ]; then
            print_success "Decryption test passed! Content matches original."
        else
            print_error "Decryption test failed! Content does not match original."
            print_status "Expected: $ORIGINAL_TEXT"
            print_status "Got: $DECRYPTED_TEXT"
            exit 1
        fi
    else
        print_error "API call failed with status $HTTP_STATUS"
        print_status "Response: $RESPONSE_BODY"
        exit 1
    fi
}

# Clean up test data
cleanup() {
    print_status "Cleaning up test data..."
    
    # Remove test blob from S3
    aws s3 rm "s3://$S3_BUCKET/$TEST_BLOB_KEY" 2>/dev/null || true
    
    print_success "Cleanup completed"
}

# Main execution
main() {
    echo "=========================================="
    echo "Solace Decrypt Service - End-to-End Test"
    echo "=========================================="
    echo
    
    check_prerequisites
    get_infrastructure_outputs
    create_sample_data
    encrypt_and_upload
    test_decryption_service
    cleanup
    
    echo
    print_success "All tests completed successfully!"
    echo
    echo "Test Summary:"
    echo "- Created sample encrypted data"
    echo "- Encrypted data using KMS key: $KMS_KEY_ID"
    echo "- Uploaded encrypted blob to S3: s3://$S3_BUCKET/$TEST_BLOB_KEY"
    echo "- Successfully decrypted data via API: $API_URL"
    echo "- Verified decrypted content matches original"
    echo
}

# Handle script interruption
trap cleanup EXIT

# Run main function
main "$@" 