#!/usr/bin/env bash
# FirstOn CRM — reset.sh  (repo root)
# Wipes ALL data volumes (MySQL, Redis, LocalStack) and restarts.
set -euo pipefail
YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'

cd "$(dirname "${BASH_SOURCE[0]}")"
DC="docker compose"; docker compose version &>/dev/null 2>&1 || DC="docker-compose"

echo -e "\n${BOLD}── FirstOn CRM — Full Reset ──${NC}"
echo -e "\n${YELLOW}⚠️  Deletes all MySQL data, Redis cache, and LocalStack state.${NC}\n"
read -r -p "  Type 'yes' to confirm: " confirm
[ "$confirm" != "yes" ] && echo "  Cancelled." && exit 0

$DC down -v --remove-orphans 2>/dev/null || true
echo "  ✅ Data wiped."
exec bash start.sh --build
