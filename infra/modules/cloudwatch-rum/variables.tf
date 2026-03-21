variable "project_name" {
  description = "Project name used for resource naming"
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

variable "web_app_domain" {
  description = "Domain of the web app (e.g. main.d1xxx.amplifyapp.com)"
  type        = string
}

variable "admin_app_domain" {
  description = "Domain of the admin app"
  type        = string
}

variable "sales_app_domain" {
  description = "Domain of the sales app"
  type        = string
}
