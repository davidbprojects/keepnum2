# KeepNum — Local Development Instructions

## Prerequisites

- Node.js 18+ and pnpm (or yarn/npm)
- AWS CLI v2 configured with credentials
- Terraform 1.5+
- Docker (for local Postgres)
- Git

## Project Structure

```
├── apps/
│   ├── web/              # React web app (Amplify hosted)
│   ├── admin/            # React admin dashboard
│   ├── sales/            # React sales/landing page
│   ├── ios/              # React Native iOS app
│   ├── android/          # React Native Android app
│   └── lambdas/          # Lambda services
│       ├── auth-service/
│       ├── number-service/
│       ├── voicemail-service/
│       ├── call-service/
│       ├── sms-service/
│       ├── billing-service/
│       ├── admin-service/
│       ├── download-service/
│       ├── spam-filter-service/
│       ├── call-screening-service/
│       ├── retention-job/
│       ├── virtual-number-service/
│       ├── ivr-service/
│       ├── auto-reply-service/
│       ├── unified-inbox-service/
│       ├── privacy-scan-service/
│       ├── caller-id-service/
│       ├── conference-service/
│       └── notification-service/
├── packages/
│   ├── shared/           # Shared types, API client, utilities
│   └── ui-components/    # Shared React UI components
├── infra/
│   ├── bootstrap/        # CloudFormation bootstrap templates
│   ├── environments/     # Terraform per-environment configs
│   └── modules/          # Terraform modules
├── db/migrations/        # Aurora Postgres migrations
├── docs/                 # OpenAPI spec + Swagger UI
└── turbo.json            # Turborepo config
```

## 1. Bootstrap a New AWS Account

Deploy the CloudFormation bootstrap stack first:

```bash
aws cloudformation deploy \
  --template-file infra/bootstrap/bootstrap.yaml \
  --stack-name keepnum-bootstrap \
  --parameter-overrides \
    ProjectName=keepnum \
    Environment=dev \
  --capabilities CAPABILITY_NAMED_IAM
```

Then deploy the IAM stack:

```bash
aws cloudformation deploy \
  --template-file infra/bootstrap/iam.yaml \
  --stack-name keepnum-iam \
  --parameter-overrides ProjectName=keepnum \
  --capabilities CAPABILITY_NAMED_IAM
```

## 2. Configure SSM Parameters

After bootstrap, set the required API keys in SSM Parameter Store:

```bash
# Telnyx API key
aws ssm put-parameter --name /keepnum/dev/telnyx-api-key --type SecureString --value "YOUR_TELNYX_KEY"

# Adyen API key
aws ssm put-parameter --name /keepnum/dev/adyen-api-key --type SecureString --value "YOUR_ADYEN_KEY"

# Caller ID provider API key
aws ssm put-parameter --name /keepnum/dev/caller-id-api-key --type SecureString --value "YOUR_CALLERID_KEY"
```

## 3. Terraform Init & Apply

```bash
cd infra/environments/dev
terraform init \
  -backend-config="bucket=keepnum-dev-terraform-state" \
  -backend-config="dynamodb_table=keepnum-dev-terraform-lock"
terraform plan
terraform apply
```

## 4. Local Database Setup

Run Postgres locally with Docker:

```bash
docker run -d \
  --name keepnum-postgres \
  -e POSTGRES_DB=keepnum \
  -e POSTGRES_USER=keepnum \
  -e POSTGRES_PASSWORD=localdev \
  -p 5432:5432 \
  postgres:15

# Run all migrations in order
for f in db/migrations/*.sql; do
  psql -h localhost -U keepnum -d keepnum -f "$f"
done
```

## 5. Environment Variables

Each Lambda service reads configuration from environment variables set by Terraform. For local development, create a `.env` file:

```bash
# Database (all services that use Aurora)
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=keepnum
DATABASE_USER=keepnum
DATABASE_PASSWORD=localdev

# Telnyx (call-service, sms-service, number-service, virtual-number-service, ivr-service, auto-reply-service, conference-service)
TELNYX_API_KEY_SSM_ARN=/keepnum/dev/telnyx-api-key

# Adyen (billing-service)
ADYEN_API_KEY_SSM_ARN=/keepnum/dev/adyen-api-key

# Caller ID provider (caller-id-service)
CALLER_ID_API_KEY_SSM_ARN=/keepnum/dev/caller-id-api-key

# DynamoDB tables (set table names for services that use DynamoDB)
SPAM_SCORES_TABLE=keepnum-dev-spam-scores
AUTO_REPLY_LOG_TABLE=keepnum-dev-auto-reply-log
UNIFIED_INBOX_TABLE=keepnum-dev-unified-inbox-items
DEVICE_TOKENS_TABLE=keepnum-dev-device-tokens
NOTIFICATION_SETTINGS_TABLE=keepnum-dev-notification-settings
CONFERENCE_LOGS_TABLE=keepnum-dev-conference-logs

# SNS (notification-service)
SNS_APNS_PLATFORM_ARN=arn:aws:sns:us-east-1:ACCOUNT:app/APNS/keepnum
SNS_FCM_PLATFORM_ARN=arn:aws:sns:us-east-1:ACCOUNT:app/GCM/keepnum

# S3 (download-service, voicemail-service)
ASSETS_BUCKET=keepnum-dev-assets

# Cognito (auth-service)
COGNITO_USER_POOL_ID=us-east-1_XXXXXXX
COGNITO_CLIENT_ID=XXXXXXXXXXXXXXXX
```

## 6. Install Dependencies

```bash
pnpm install    # or: npm install / yarn install
```

## 7. Build & Typecheck

```bash
# Build all packages
npx turbo run build

# Typecheck everything
npx turbo run typecheck
```

## 8. Running Tests

```bash
# Run all tests
npx turbo run test

# Run tests for a specific service
npx turbo run test --filter=@keepnum/call-service

# Run tests with coverage
npx turbo run test -- --coverage
```

## 9. Running a Lambda Locally

You can invoke a Lambda handler locally with a mock event:

```bash
cd apps/lambdas/auth-service
npx ts-node -e "
const { handler } = require('./src/index');
handler({
  httpMethod: 'POST',
  path: '/auth/login',
  body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
  headers: { 'content-type': 'application/json' }
}).then(console.log);
"
```

## 10. Running Web Apps Locally

```bash
# Web app
cd apps/web && npm start

# Admin app
cd apps/admin && npm start

# Sales app
cd apps/sales && npm start
```

## 11. Deploying

### CI/CD Pipeline

The CI/CD role created by `iam.yaml` has permissions for:
- Lambda function updates
- API Gateway deployments
- DynamoDB table management
- S3 asset uploads
- CloudFormation stack operations

### Manual Deployment

```bash
# Build all Lambda services
npx turbo run build --filter='./apps/lambdas/*'

# Deploy infrastructure changes
cd infra/environments/dev
terraform apply

# Deploy web apps (Amplify auto-deploys from Git)
git push origin main
```

## 12. API Documentation

The OpenAPI spec is at `docs/openapi.yaml`. Open `docs/index.html` in a browser for the Swagger UI.

## 13. Troubleshooting

| Issue | Solution |
|-------|---------|
| `Cannot find module '@keepnum/shared'` | Run `npx turbo run build --filter=@keepnum/shared` first |
| Database connection refused | Ensure Docker Postgres is running on port 5432 |
| SSM parameter not found | Verify parameters exist in the correct AWS region |
| Terraform state lock | Run `terraform force-unlock <LOCK_ID>` |
| Amplify build fails | Check that `packages/shared` and `packages/ui-components` build successfully |
| Lambda timeout locally | Increase Node.js memory: `NODE_OPTIONS=--max-old-space-size=4096` |

## 14. Feature Flags

All new features are gated behind feature flags. Default values are set in `db/migrations/034_feature_flag_defaults.sql`. Flags can be managed per-user via the admin dashboard.

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `visual_voicemail_inbox` | boolean | false | Folder-based voicemail with bulk actions |
| `virtual_numbers` | boolean | false | Virtual number provisioning |
| `ivr_auto_attendant` | boolean | false | IVR menu builder |
| `auto_reply_sms` | boolean | false | Auto-reply SMS templates |
| `unified_inbox` | boolean | false | Aggregated message feed |
| `privacy_scan` | boolean | false | Data broker scanning |
| `push_notifications` | boolean | false | Push notification delivery |
| `greetings_marketplace` | boolean | false | Greeting catalogue |
| `caller_id_lookup` | boolean | false | Reverse phone lookup |
| `voicemail_to_sms` | boolean | false | Transcription forwarding |
| `smart_routing` | boolean | false | Contact tier-based routing |
| `dnd_scheduling` | boolean | false | Do Not Disturb schedules |
| `voicemail_sharing` | boolean | false | Share voicemails via link |
| `call_recording` | boolean | false | Call recording with consent |
| `conference_calling` | boolean | false | Conference bridges |
| `max_virtual_numbers` | numeric | 5 | Per-user virtual number limit |
| `max_conference_participants` | numeric | 10 | Per-conference participant limit |
