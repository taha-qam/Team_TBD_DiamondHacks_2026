#!/bin/bash

# FallGuard endpoint testing script
# Usage: ./test-endpoints.sh

BASE="http://localhost:3000"

echo "=== 1. Test alert store ==="
curl -s "$BASE/api/test-store" | python3 -m json.tool
echo ""

echo "=== 2. Test OpenClaw webhook ==="
curl -s "$BASE/api/test-openclaw" | python3 -m json.tool
echo ""

echo "=== 3. Simulate a fall detection (POST /api/fall-detected) ==="
curl -s -X POST "$BASE/api/fall-detected" \
  -H "Content-Type: application/json" \
  -H "X-Camera-Secret: fallguard-dev-secret" \
  -d '{"cameraId":"cam-01","cameraLabel":"Living Room Camera","patientName":"Taha","imagePath":"/fall-images/fall-123.jpg"}' \
  | python3 -m json.tool
echo ""

echo "=== 4. List all alerts ==="
curl -s "$BASE/api/alerts" | python3 -m json.tool
echo ""

echo "=== 5. Get deployment profile ==="
curl -s "$BASE/api/config" | python3 -m json.tool
echo ""

echo "=== Done ==="
