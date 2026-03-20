variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
}

variable "environment" {
  description = "Deployment environment (e.g. dev, prod)"
  type        = string
}

variable "retention_job_lambda_arn" {
  description = "ARN of the retention-job Lambda function"
  type        = string
}

variable "retention_job_lambda_function_name" {
  description = "Name of the retention-job Lambda function (used for lambda permission)"
  type        = string
}
