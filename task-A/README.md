# Task A: Enclave-Style Decryption Service

This project implements a secure decryption service using AWS Lambda + KMS to emulate a Trusted Execution Environment (TEE) for "data in use" security.

## Architecture

- **Lambda Function**: Handles decryption requests via HTTP POST
- **KMS Key**: Encrypts/decrypts data with IAM policy restrictions
- **S3 Bucket**: Stores encrypted blobs
- **API Gateway**: Provides HTTPS endpoint for public invocation

## Prerequisites

- Node.js (>=16.x)
- Python (>=3.9)
- AWS CLI configured with appropriate permissions
- Terraform CLI
- Git

### AWS Permissions Required

Your AWS account needs permissions for:
- Lambda (create, update, invoke)
- KMS (create, manage keys, encrypt, decrypt)
- S3 (create bucket, read objects)
- IAM (create roles and policies)
- API Gateway (create REST API)

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
cd task-A
npm install
```

### 2. Configure AWS Credentials

```bash
aws configure
```

### 3. Deploy Infrastructure

```bash
cd infra
terraform init
terraform plan
terraform apply
```

### 4. Deploy Lambda Function

```bash
cd ../src
npm run build
npm run deploy
```

## Usage

### API Endpoint

The service exposes a POST endpoint at:
```
https://{api-gateway-id}.execute-api.{region}.amazonaws.com/prod/decrypt
```

### Request Format

```json
{
  "blobKey": "path/to/encrypted/blob"
}
```

### Response Format

```json
{
  "plaintext": "decrypted content"
}
```

### Example Usage

```bash
# Using the provided test script
./decrypt_test.sh

# Or manually with curl
curl -X POST \
  https://{api-gateway-id}.execute-api.{region}.amazonaws.com/prod/decrypt \
  -H "Content-Type: application/json" \
  -d '{"blobKey": "test-encrypted-blob"}'
```

## Security Features

- **Least-privilege IAM roles**: Lambda can only decrypt with the specific KMS key
- **Encryption at rest**: S3 bucket enforces encryption
- **HTTPS only**: API Gateway enforces TLS
- **CORS headers**: Properly configured for web clients
- **KMS key policy**: Restricts decryption to only this Lambda function

## Testing

Run the provided test script to verify end-to-end functionality:

```bash
./decrypt_test.sh
```

This script will:
1. Create a test encrypted blob
2. Upload it to S3
3. Call the decryption service
4. Verify the decrypted content

## Cleanup

To remove all resources:

```bash
cd infra
terraform destroy
```

## Troubleshooting

### Common Issues

1. **KMS Permission Denied**: Ensure the Lambda role has decrypt permissions on the KMS key
2. **S3 Access Denied**: Verify the bucket policy allows Lambda read access
3. **CORS Errors**: Check that API Gateway CORS is properly configured

### Logs

View Lambda logs:
```bash
aws logs tail /aws/lambda/solace-decrypt-service --follow
```

## File Structure

```
task-A/
├── README.md                 # This file
├── src/                      # Lambda function source
│   ├── index.js             # Main handler
│   ├── package.json         # Dependencies
│   └── test/                # Unit tests
├── infra/                   # Infrastructure as Code
│   ├── main.tf             # Terraform configuration
│   ├── variables.tf        # Input variables
│   └── outputs.tf          # Output values
├── decrypt_test.sh          # End-to-end test script
└── sample-data/            # Test data
    └── test-blob.txt       # Sample encrypted blob
``` 