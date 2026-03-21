variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "aws_region" {
  description = "AWS region"
  type        = string
}

variable "terraform_state_bucket" {
  description = "S3 bucket name for Terraform state (to enable access logging)"
  type        = string
  default     = ""
}
