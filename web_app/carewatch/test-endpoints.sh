#!/bin/bash

# CareWatch endpoint testing script
# Start `npm run dev` first, then run this in another terminal
# Usage: ./test-endpoints.sh

BASE="http://localhost:3000"

echo "=== 1. Test OpenClaw webhook ==="
echo "Sending test alert to OpenClaw → Telegram..."
curl -s "$BASE/api/test-openclaw" | python3 -m json.tool
echo ""

echo "=== 2. List patients ==="
curl -s "$BASE/api/patients" | python3 -m json.tool
echo ""

echo "=== 3. List current alerts ==="
curl -s "$BASE/api/fall" | python3 -m json.tool
echo ""

echo "=== 4. Simulate fall detection (POST /api/fall) ==="
curl -s -X POST "$BASE/api/fall" \
  -H "Content-Type: application/json" \
  -d '{
    "timestamp": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'",
    "patient": {"id": "patient-1", "name": "Taha"},
    "monitoring": {"location": "Living Room", "cameraNumber": 1},
    "imagePath": "/fall-images/fall-test.jpg"
  }' | python3 -m json.tool
echo ""

echo "=== 5. Verify alert was stored ==="
curl -s "$BASE/api/fall" | python3 -m json.tool
echo ""

echo "=== Done ==="
echo "Check Telegram for the OpenClaw test message from step 1."
