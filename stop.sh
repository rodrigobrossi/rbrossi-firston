#!/usr/bin/env bash
# FirstOn CRM — stop.sh  (repo root)
set -euo pipefail
CYAN='\033[0;36m'; GREEN='\033[0;32m'; BOLD='\033[1m'; NC='\033[0m'

cd "$(dirname "${BASH_SOURCE[0]}")"
DC="docker compose"; docker compose version &>/dev/null 2>&1 || DC="docker-compose"

echo -e "\n${BOLD}${CYAN}── Stopping FirstOn CRM ──${NC}\n"
$DC stop
echo -e "\n${GREEN}✅  Stopped. Data preserved.${NC}"
echo -e "  Restart:   bash start.sh"
echo -e "  Wipe data: bash reset.sh\n"
