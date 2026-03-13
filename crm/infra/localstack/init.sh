#!/bin/bash
# ============================================================
# LocalStack init — runs automatically on container start
# Creates all AWS resources that the app expects
# ============================================================
set -e

echo "🚀 [LocalStack] Initializing FirstOn CRM resources..."
export AWS_DEFAULT_REGION=sa-east-1
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
ENDPOINT="http://localhost:4566"

# ── S3 Buckets ───────────────────────────────────────────────
echo "📦 Creating S3 buckets..."
awslocal s3 mb s3://firston-contracts --region sa-east-1
awslocal s3 mb s3://firston-assets    --region sa-east-1

# Block public access on contracts bucket
awslocal s3api put-public-access-block \
  --bucket firston-contracts \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# Enable versioning on contracts bucket
awslocal s3api put-bucket-versioning \
  --bucket firston-contracts \
  --versioning-configuration Status=Enabled

echo "✅ S3 buckets: firston-contracts, firston-assets"

# ── KMS Key ──────────────────────────────────────────────────
echo "🔑 Creating KMS key for PII encryption..."
KMS_KEY_ID=$(awslocal kms create-key \
  --description "FirstOn CRM PII encryption key" \
  --key-usage ENCRYPT_DECRYPT \
  --query 'KeyMetadata.KeyId' \
  --output text)

awslocal kms create-alias \
  --alias-name alias/firston-crm-pii \
  --target-key-id "$KMS_KEY_ID"

echo "✅ KMS key: alias/firston-crm-pii ($KMS_KEY_ID)"

# ── Secrets Manager — PIX key ────────────────────────────────
echo "🔒 Storing PIX key in Secrets Manager..."
awslocal secretsmanager create-secret \
  --name "firston/billing/pix-key" \
  --description "PIX key for billing (local dev)" \
  --secret-string '{"pix_key":"000.000.000-00","pix_type":"CPF"}'

echo "✅ Secret: firston/billing/pix-key"

# ── SQS Queues ───────────────────────────────────────────────
echo "📬 Creating SQS queues..."
awslocal sqs create-queue --queue-name firston-notifications
awslocal sqs create-queue --queue-name firston-events
awslocal sqs create-queue --queue-name firston-billing

echo "✅ SQS queues: notifications, events, billing"

echo ""
echo "✅ [LocalStack] All resources ready!"
echo "   S3:             http://localhost:4566"
echo "   Secrets:        http://localhost:4566"
echo "   KMS key alias:  alias/firston-crm-pii"
