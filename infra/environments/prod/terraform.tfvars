###############################################################################
# Prod Environment Values
###############################################################################

project_name = "keepnum"
environment  = "prod"
aws_region   = "us-east-1"

# Networking — replace with actual VPC/subnet IDs
vpc_id               = "PLACEHOLDER_VPC_ID"
private_subnet_ids   = ["PLACEHOLDER_SUBNET_1", "PLACEHOLDER_SUBNET_2"]
lambda_security_group_id = "PLACEHOLDER_SG_ID"

# Aurora Serverless v2
aurora_master_username = "PLACEHOLDER_USERNAME"
aurora_master_password = "PLACEHOLDER_PASSWORD"
aurora_min_capacity    = 2
aurora_max_capacity    = 16

# WAF
rate_limit     = 5000
adyen_ip_cidrs = []

# SSM Parameter ARNs — replace with actual ARNs after creating parameters
telnyx_api_key_ssm_arn = "PLACEHOLDER_TELNYX_SSM_ARN"
adyen_api_key_ssm_arn  = "PLACEHOLDER_ADYEN_API_SSM_ARN"
adyen_hmac_key_ssm_arn = "PLACEHOLDER_ADYEN_HMAC_SSM_ARN"
ses_identity_arn       = "PLACEHOLDER_SES_IDENTITY_ARN"

# Amplify
repository_url      = "https://github.com/PLACEHOLDER_ORG/keepnum"
github_access_token = "PLACEHOLDER_GITHUB_TOKEN"
