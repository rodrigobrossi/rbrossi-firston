#!/usr/bin/env bash
# FirstOn CRM — status.sh  (repo root)
set -euo pipefail
GREEN='\033[0;32m'; RED='\033[0;31m'; CYAN='\033[0;36m'
BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'

cd "$(dirname "${BASH_SOURCE[0]}")"
DC="docker compose"; docker compose version &>/dev/null 2>&1 || DC="docker-compose"

echo -e "\n${BOLD}${CYAN}══════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  FirstOn CRM — Status${NC}"
echo -e "${BOLD}${CYAN}══════════════════════════════════════════════════${NC}\n"

echo -e "${BOLD}Containers:${NC}"
while IFS= read -r line; do
  echo "$line" | grep -q "running" \
    && echo -e "  ${GREEN}●${NC} $line" \
    || echo -e "  ${RED}●${NC} $line"
done < <($DC ps 2>/dev/null | tail -n +2) || true

echo -e "\n${BOLD}Service health:${NC}"
chk() {
  local label="$1" url="$2"
  curl -sf --max-time 3 "$url" &>/dev/null \
    && echo -e "  ${GREEN}✅${NC}  ${BOLD}${label}${NC}  ${DIM}${url}${NC}" \
    || echo -e "  ${RED}❌${NC}  ${BOLD}${label}${NC}  ${DIM}${url}${NC}"
}
chk "frontend"      "http://localhost:3000"
chk "bff"           "http://localhost:4000/health"
chk "gateway"       "http://localhost:8080/health"
chk "auth"          "http://localhost:3001/health"
chk "contact"       "http://localhost:3002/health"
chk "calendar"      "http://localhost:3003/health"
chk "pipeline"      "http://localhost:3004/health"
chk "contract"      "http://localhost:3005/health"
chk "messaging"     "http://localhost:3006/health"
chk "sentiment"     "http://localhost:3007/health"
chk "billing"       "http://localhost:3008/health"
chk "notification"  "http://localhost:3009/health"
chk "localstack"    "http://localhost:4566/_localstack/health"
chk "mailhog"       "http://localhost:8025"

echo -e "\n${BOLD}Access:${NC}"
echo -e "  ${CYAN}→${NC} App         http://localhost:3000"
echo -e "  ${CYAN}→${NC} BFF / API   http://localhost:4000"
echo -e "  ${CYAN}→${NC} Gateway     http://localhost:8080"
echo -e "  ${CYAN}→${NC} Emails      http://localhost:8025"
echo -e "  ${CYAN}→${NC} MySQL       localhost:3306  (firston / firstonpass)"
echo -e "  ${CYAN}→${NC} Redis       localhost:6379"
echo -e "  ${CYAN}→${NC} LocalStack  http://localhost:4566\n"
