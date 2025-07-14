output "api_gateway_url" {
  description = "API Gateway URL for the decrypt service"
  value       = "https://${aws_api_gateway_rest_api.decrypt_api.id}.execute-api.${var.aws_region}.amazonaws.com/${aws_api_gateway_stage.decrypt_stage.stage_name}/decrypt"
}

output "lambda_function_name" {
  description = "Name of the Lambda function"
  value       = aws_lambda_function.decrypt_service.function_name
}

output "lambda_function_arn" {
  description = "ARN of the Lambda function"
  value       = aws_lambda_function.decrypt_service.arn
}

output "s3_bucket_name" {
  description = "Name of the S3 bucket for encrypted blobs"
  value       = aws_s3_bucket.encrypted_blobs.bucket
}

output "kms_key_id" {
  description = "ID of the KMS key used for decryption"
  value       = aws_kms_key.decrypt_key.key_id
}

output "kms_key_alias" {
  description = "Alias of the KMS key"
  value       = aws_kms_alias.decrypt_key.name
}

output "lambda_role_arn" {
  description = "ARN of the Lambda execution role"
  value       = aws_iam_role.lambda_role.arn
} 

