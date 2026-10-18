#!/usr/bin/env bash
set -euo pipefail
CLIENT="${1:?usage: issue-key.sh <client-name>}"
: "${KVS_ARN:?set KVS_ARN first}"

KEY="mdc_live_$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n')"
HASH=$(printf %s "$KEY" | shasum -a 256 | cut -d' ' -f1)

ETAG=$(aws cloudfront-keyvaluestore describe-key-value-store \
  --kvs-arn "$KVS_ARN" --query ETag --output text)

aws cloudfront-keyvaluestore put-key \
  --kvs-arn "$KVS_ARN" --key "$HASH" \
  --value "{\"client\":\"$CLIENT\",\"created\":\"$(date -u +%F)\"}" \
  --if-match "$ETAG" >/dev/null

echo "Client: $CLIENT"
echo "API key (shown once): $KEY"
