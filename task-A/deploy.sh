#!/bin/bash

# Solace Decrypt Service Deployment Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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
    
    if ! command_exists node; then
        print_error "Node.js is not installed. Please install Node.js >= 16.x"
        exit 1
    fi
    
    if ! command_exists npm; then
        print_error "npm is not installed. Please install npm"
        exit 1
    fi
    
    if ! command_exists aws; then
        print_error "AWS CLI is not installed. Please install it first."
        exit 1
    fi
    
    if ! command_exists terraform; then
        print_error "Terraform is not installed. Please install it first."
        exit 1
    fi
    
    # Check AWS credentials
    if ! aws sts get-caller-identity >/dev/null 2>&1; then
        print_error "AWS credentials are not configured. Please run 'aws configure' first."
        exit 1
    fi
    
    print_success "Prerequisites check passed"
}

# Deploy infrastructure
deploy_infrastructure() {
    print_status "Deploying infrastructure with Terraform..."
    
    cd infra
    
    print_status "Initializing Terraform..."
    terraform init
    
    print_status "Planning Terraform deployment..."
    terraform plan -out=tfplan
    
    print_status "Applying Terraform configuration..."
    terraform apply tfplan
    
    print_success "Infrastructure deployed successfully"
}

# Build and deploy Lambda function
deploy_lambda() {
    print_status "Building and deploying Lambda function..."
    
    cd src
    
    print_status "Installing dependencies..."
    npm install --production
    
    print_status "Creating deployment package..."
    zip -r function.zip . -x '*.git*' 'node_modules/.cache/*' 'test/*' '*.md'
    
    print_status "Getting Lambda function name from Terraform..."
    cd ../infra
    LAMBDA_FUNCTION_NAME=$(terraform output -raw lambda_function_name)
    
    print_status "Updating Lambda function code..."
    aws lambda update-function-code \
        --function-name "$LAMBDA_FUNCTION_NAME" \
        --zip-file fileb://../src/function.zip
    
    print_status "Waiting for Lambda function update to complete..."
    aws lambda wait function-updated --function-name "$LAMBDA_FUNCTION_NAME"
    
    print_success "Lambda function deployed successfully"
}

# Test the deployment
test_deployment() {
    print_status "Testing the deployment..."
    
    cd ..
    ./decrypt_test.sh
    
    print_success "Deployment test completed successfully"
}

# Main execution
main() {
    echo "=========================================="
    echo "Solace Decrypt Service - Deployment"
    echo "=========================================="
    echo
    
    check_prerequisites
    deploy_infrastructure
    deploy_lambda
    test_deployment
    
    echo
    print_success "Deployment completed successfully!"
    echo
    echo "Next steps:"
    echo "1. The API endpoint is available at the URL shown in the test output"
    echo "2. You can use the decrypt_test.sh script to test the service"
    echo "3. To clean up, run: cd infra && terraform destroy"
    echo
}

# Run main function
main "$@" 