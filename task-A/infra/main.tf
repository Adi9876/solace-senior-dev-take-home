terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# Data sources
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# S3 Bucket for encrypted blobs
resource "aws_s3_bucket" "encrypted_blobs" {
  bucket = "${var.project_name}-${var.environment}-encrypted-blobs-${random_string.bucket_suffix.result}"
  
  tags = {
    Name        = "${var.project_name}-encrypted-blobs"
    Environment = var.environment
    Project     = var.project_name
  }
}

resource "random_string" "bucket_suffix" {
  length  = 8
  special = false
  upper   = false
}

# S3 Bucket encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "encrypted_blobs" {
  bucket = aws_s3_bucket.encrypted_blobs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# S3 Bucket versioning
resource "aws_s3_bucket_versioning" "encrypted_blobs" {
  bucket = aws_s3_bucket.encrypted_blobs.id
  versioning_configuration {
    status = "Enabled"
  }
}

# S3 Bucket public access block
resource "aws_s3_bucket_public_access_block" "encrypted_blobs" {
  bucket = aws_s3_bucket.encrypted_blobs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# S3 Bucket policy
resource "aws_s3_bucket_policy" "encrypted_blobs" {
  bucket = aws_s3_bucket.encrypted_blobs.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowLambdaReadAccess"
        Effect = "Allow"
        Principal = {
          AWS = aws_iam_role.lambda_role.arn
        }
        Action = [
          "s3:GetObject",
          "s3:GetObjectVersion"
        ]
        Resource = "${aws_s3_bucket.encrypted_blobs.arn}/*"
      }
    ]
  })
}

# KMS Key for encryption/decryption
resource "aws_kms_key" "decrypt_key" {
  description             = "KMS key for Solace decrypt service"
  deletion_window_in_days = 7
  enable_key_rotation     = true

  tags = {
    Name        = "${var.project_name}-decrypt-key"
    Environment = var.environment
    Project     = var.project_name
  }
}

# KMS Key alias
resource "aws_kms_alias" "decrypt_key" {
  name          = "alias/${var.project_name}/decrypt"
  target_key_id = aws_kms_key.decrypt_key.key_id
}

# KMS Key policy
resource "aws_kms_key_policy" "decrypt_key" {
  key_id = aws_kms_key.decrypt_key.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "Allow Lambda Decrypt"
        Effect = "Allow"
        Principal = {
          AWS = aws_iam_role.lambda_role.arn
        }
        Action = [
          "kms:Decrypt",
          "kms:DescribeKey"
        ]
        Resource = "*"
      }
    ]
  })
}

# IAM Role for Lambda
resource "aws_iam_role" "lambda_role" {
  name = "${var.project_name}-${var.environment}-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name        = "${var.project_name}-lambda-role"
    Environment = var.environment
    Project     = var.project_name
  }
}

# IAM Policy for Lambda
resource "aws_iam_role_policy" "lambda_policy" {
  name = "${var.project_name}-${var.environment}-lambda-policy"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/${var.project_name}-decrypt-service:*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:GetObjectVersion"
        ]
        Resource = "${aws_s3_bucket.encrypted_blobs.arn}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:DescribeKey"
        ]
        Resource = aws_kms_key.decrypt_key.arn
      }
    ]
  })
}

# Lambda Function
resource "aws_lambda_function" "decrypt_service" {
  filename         = "../src/function.zip"
  source_code_hash = filebase64sha256("../src/function.zip")
  function_name    = "${var.project_name}-decrypt-service"
  role            = aws_iam_role.lambda_role.arn
  handler         = "index.handler"
  runtime         = "nodejs18.x"
  timeout         = var.lambda_timeout
  memory_size     = var.lambda_memory_size

  environment {
    variables = {
      S3_BUCKET_NAME = aws_s3_bucket.encrypted_blobs.bucket
      KMS_KEY_ID     = aws_kms_key.decrypt_key.key_id
    }
  }

  tags = {
    Name        = "${var.project_name}-decrypt-service"
    Environment = var.environment
    Project     = var.project_name
  }
}

# API Gateway
resource "aws_api_gateway_rest_api" "decrypt_api" {
  name = "${var.project_name}-decrypt-api"

  tags = {
    Name        = "${var.project_name}-decrypt-api"
    Environment = var.environment
    Project     = var.project_name
  }
}

# API Gateway Resource
resource "aws_api_gateway_resource" "decrypt_resource" {
  rest_api_id = aws_api_gateway_rest_api.decrypt_api.id
  parent_id   = aws_api_gateway_rest_api.decrypt_api.root_resource_id
  path_part   = "decrypt"
}

# API Gateway Method
resource "aws_api_gateway_method" "decrypt_method" {
  rest_api_id   = aws_api_gateway_rest_api.decrypt_api.id
  resource_id   = aws_api_gateway_resource.decrypt_resource.id
  http_method   = "POST"
  authorization = "NONE"
}

# API Gateway Integration
resource "aws_api_gateway_integration" "decrypt_integration" {
  rest_api_id = aws_api_gateway_rest_api.decrypt_api.id
  resource_id = aws_api_gateway_resource.decrypt_resource.id
  http_method = aws_api_gateway_method.decrypt_method.http_method

  integration_http_method = "POST"
  type                   = "AWS_PROXY"
  uri                    = aws_lambda_function.decrypt_service.invoke_arn
}

# API Gateway Method Response
resource "aws_api_gateway_method_response" "decrypt_method_response" {
  rest_api_id = aws_api_gateway_rest_api.decrypt_api.id
  resource_id = aws_api_gateway_resource.decrypt_resource.id
  http_method = aws_api_gateway_method.decrypt_method.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin" = true
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
  }
}

# API Gateway Integration Response
resource "aws_api_gateway_integration_response" "decrypt_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.decrypt_api.id
  resource_id = aws_api_gateway_resource.decrypt_resource.id
  http_method = aws_api_gateway_method.decrypt_method.http_method
  status_code = aws_api_gateway_method_response.decrypt_method_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin" = "'*'"
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'"
  }
}

# OPTIONS method for CORS
resource "aws_api_gateway_method" "decrypt_options" {
  rest_api_id   = aws_api_gateway_rest_api.decrypt_api.id
  resource_id   = aws_api_gateway_resource.decrypt_resource.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# OPTIONS integration
resource "aws_api_gateway_integration" "decrypt_options_integration" {
  rest_api_id = aws_api_gateway_rest_api.decrypt_api.id
  resource_id = aws_api_gateway_resource.decrypt_resource.id
  http_method = aws_api_gateway_method.decrypt_options.http_method

  type = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

# OPTIONS method response
resource "aws_api_gateway_method_response" "decrypt_options_response" {
  rest_api_id = aws_api_gateway_rest_api.decrypt_api.id
  resource_id = aws_api_gateway_resource.decrypt_resource.id
  http_method = aws_api_gateway_method.decrypt_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin" = true
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
  }
}

# OPTIONS integration response
resource "aws_api_gateway_integration_response" "decrypt_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.decrypt_api.id
  resource_id = aws_api_gateway_resource.decrypt_resource.id
  http_method = aws_api_gateway_method.decrypt_options.http_method
  status_code = aws_api_gateway_method_response.decrypt_options_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin" = "'*'"
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'"
  }
}

# API Gateway Deployment
resource "aws_api_gateway_deployment" "decrypt_deployment" {
  depends_on = [
    aws_api_gateway_integration.decrypt_integration,
    aws_api_gateway_integration.decrypt_options_integration
  ]

  rest_api_id = aws_api_gateway_rest_api.decrypt_api.id
}

# API Gateway Stage (new, replaces deprecated stage_name in deployment)
resource "aws_api_gateway_stage" "decrypt_stage" {
  rest_api_id   = aws_api_gateway_rest_api.decrypt_api.id
  deployment_id = aws_api_gateway_deployment.decrypt_deployment.id
  stage_name    = var.aws_api_gateway_stage
}

# Lambda Permission for API Gateway
resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.decrypt_service.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.decrypt_api.execution_arn}/*/*"
} 