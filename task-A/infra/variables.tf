variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
  default     = "solace"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "prod"
}

variable "lambda_timeout" {
  description = "Lambda function timeout in seconds"
  type        = number
  default     = 30
}

variable "lambda_memory_size" {
  description = "Lambda function memory size in MB"
  type        = number
  default     = 256
}

variable "aws_api_gateway_stage" {
     description = "The stage name for the API Gateway deployment"
     type        = string
     default     = "dev"
} 