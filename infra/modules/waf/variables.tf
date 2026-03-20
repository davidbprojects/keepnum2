variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
}

variable "environment" {
  description = "Deployment environment (e.g. dev, prod)"
  type        = string
}

variable "adyen_ip_cidrs" {
  description = "List of Adyen IP CIDR ranges to allowlist for webhook traffic"
  type        = list(string)
  default     = []
}

variable "rate_limit" {
  description = "Maximum number of requests per 5-minute window per IP"
  type        = number
  default     = 2000
}
