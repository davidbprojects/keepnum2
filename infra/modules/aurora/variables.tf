variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
}

variable "environment" {
  description = "Deployment environment (e.g. dev, prod)"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID where the Aurora cluster will be deployed"
  type        = string
}

variable "subnet_ids" {
  description = "List of subnet IDs for the DB subnet group"
  type        = list(string)
}

variable "lambda_security_group_id" {
  description = "Security group ID of the Lambda functions allowed to connect to Aurora"
  type        = string
}

variable "master_username" {
  description = "Master username for the Aurora cluster"
  type        = string
  sensitive   = true
}

variable "master_password" {
  description = "Master password for the Aurora cluster"
  type        = string
  sensitive   = true
}

variable "min_capacity" {
  description = "Minimum ACU capacity for Aurora Serverless v2 scaling"
  type        = number
  default     = 0.5
}

variable "max_capacity" {
  description = "Maximum ACU capacity for Aurora Serverless v2 scaling"
  type        = number
  default     = 4
}
