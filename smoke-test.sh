#!/usr/bin/env bash
# FirstOn CRM — smoke-test.sh  (repo root)
# Runs after start.sh to verify everything is healthy.
set -euo pipefail
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

cd "$(dirname "${BASH_SOURCE[0]}")"
PASS=0; FAIL=0

chk() {
  local label="$1" url="$2" expect="$3"
  local out; out=$(curl -sf --max-time 5 "$url" 2>/dev/null || echo "")
  if echo "$out" | grep -q "$expect"; then
    echo -e "  ${GREEN}✅${NC}  $label"
    PASS=$((PASS+1))
  else
    echo -e "  ${RED}❌${NC}  $label  ${YELLOW}(expected: $expect)${NC}"
    FAIL=$((FAIL+1))
  fi
}

echo ""
echo -e "${BOLD}${CYAN}══════════════════════════════════════════${NC}"
echo -e "${BOLD}  FirstOn CRM — Smoke Test${NC}"
echo -e "${BOLD}${CYAN}══════════════════════════════════════════${NC}"

echo -e "\n${BOLD}Infrastructure:${NC}"
chk "Gateway"    "http://localhost:8080/health"                        "gateway"
chk "LocalStack" "http://localhost:4566/_localstack/health"           "running"
chk "Mailhog"    "http://localhost:8025"                              "MailHog"

echo -e "\n${BOLD}Microservices:${NC}"
chk "auth"         "http://localhost:3001/health" "auth-service"
chk "contact"      "http://localhost:3002/health" "contact-service"
chk "calendar"     "http://localhost:3003/health" "calendar-service"
chk "pipeline"     "http://localhost:3004/health" "pipeline-service"
chk "contract"     "http://localhost:3005/health" "contract-service"
chk "messaging"    "http://localhost:3006/health" "messaging-service"
chk "sentiment"    "http://localhost:3007/health" "sentiment-service"
chk "billing"      "http://localhost:3008/health" "billing-service"
chk "notification" "http://localhost:3009/health" "notification-service"

echo -e "\n${BOLD}Dev login:${NC}"
TOKEN=$(curl -s --max-time 5 -X POST http://localhost:3001/auth/dev-login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@firston.com.br","name":"Demo"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null || echo "")
if [ -n "$TOKEN" ]; then
  echo -e "  ${GREEN}✅${NC}  JWT issued (${#TOKEN} chars)"
  PASS=$((PASS+1))
else
  echo -e "  ${RED}❌${NC}  dev-login returned no token"
  FAIL=$((FAIL+1))
fi

echo -e "\n${BOLD}Sentiment (PT-BR):${NC}"
STRESS=$(curl -s --max-time 5 -X POST http://localhost:3007/sentiment/analyze \
  -H "Content-Type: application/json" \
  -d '{"text":"Estou muito frustrado com o atraso, isso é absurdo!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('stress_score',0))" 2>/dev/null || echo "0")
if [ "$STRESS" -gt 30 ] 2>/dev/null; then
  echo -e "  ${GREEN}✅${NC}  stress_score=$STRESS (correctly high)"
  PASS=$((PASS+1))
else
  echo -e "  ${YELLOW}⚠️ ${NC}  stress_score=$STRESS (unexpected)"
fi

echo ""
echo -e "${BOLD}${CYAN}══════════════════════════════════════════${NC}"
if [ "$FAIL" -eq 0 ]; then
  echo -e "${BOLD}  ✅  All $PASS checks passed — system is healthy!${NC}"
else
  echo -e "${BOLD}  ${RED}$FAIL failed${NC}${BOLD}, $PASS passed${NC}"
  echo -e "  Debug: docker compose logs <service-name>"
fi
echo -e "${BOLD}${CYAN}══════════════════════════════════════════${NC}\n"

[ "$FAIL" -gt 0 ] && exit 1 || exit 0
