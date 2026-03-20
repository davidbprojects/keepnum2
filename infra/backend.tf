# Remote state configuration — values overridden per environment via -backend-config
terraform {
  backend "s3" {
    bucket         = "PLACEHOLDER"
    key            = "PLACEHOLDER"
    region         = "us-east-2"
    dynamodb_table = "PLACEHOLDER"
    encrypt        = true
  }
}
