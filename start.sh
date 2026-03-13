#!/usr/bin/env bash
# =============================================================
#  FirstOn CRM — start.sh
#  Runs from repo root alongside docker-compose.yml
#
#  Usage:
#    bash start.sh            # normal start
#    bash start.sh --build    # force rebuild all images
#    bash start.sh --fresh    # wipe all data + restart clean
# =============================================================

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'

log()  { echo -e "${BOLD}${CYAN}▶${NC} $*"; }
ok()   { echo -e "  ${GREEN}✅${NC} $*"; }
warn() { echo -e "  ${YELLOW}⚠️ ${NC} $*"; }
err()  { echo -e "  ${RED}❌${NC} $*"; }

# Always cd to the directory this script lives in (repo root)
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

# ── Flags ────────────────────────────────────────────────────
BUILD_FLAG=""; FRESH=false
for arg in "$@"; do
  case $arg in
    --build) BUILD_FLAG="--build" ;;
    --fresh) FRESH=true ;;
    --help|-h)
      echo "Usage: bash start.sh [--build] [--fresh]"
      echo "  --build   Force rebuild all Docker images"
      echo "  --fresh   Wipe all data volumes and start clean"
      exit 0 ;;
  esac
done

# ── Banner ───────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}  ╔══════════════════════════════════════╗"
echo -e "  ║       FirstOn CRM — local dev        ║"
echo -e "  ╚══════════════════════════════════════╝${NC}"
echo -e "  ${DIM}$REPO_ROOT${NC}"
echo ""

# ── 1. Check Docker ──────────────────────────────────────────
log "Checking Docker..."
if ! command -v docker &>/dev/null; then
  err "Docker not found. Install → https://www.docker.com/products/docker-desktop"
  exit 1
fi
if ! docker info &>/dev/null 2>&1; then
  err "Docker daemon is not running. Start Docker Desktop first."
  exit 1
fi
if docker compose version &>/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose &>/dev/null; then
  DC="docker-compose"
else
  err "docker compose not found. Install Docker Desktop 4.x+"
  exit 1
fi
ok "Docker ready  (using: $DC)"

# ── 2. .env ──────────────────────────────────────────────────
log "Environment..."
if [ ! -f ".env" ]; then
  cp crm/.env.example .env
  ok ".env created from crm/.env.example"
else
  ok ".env exists"
fi

# ── 3. Fresh wipe ────────────────────────────────────────────
if [ "$FRESH" = true ]; then
  echo ""
  warn "This will DELETE all CRM data (MySQL, Redis, LocalStack)."
  read -r -p "  Type 'yes' to confirm: " confirm
  if [ "$confirm" = "yes" ]; then
    $DC down -v --remove-orphans 2>/dev/null || true
    ok "Volumes wiped"
  else
    log "Skipped."
  fi
fi

# ── 4. Start ─────────────────────────────────────────────────
echo ""
log "Starting all containers..."
$DC up -d $BUILD_FLAG

# ── 5. Wait: MySQL ───────────────────────────────────────────
echo ""
log "Waiting for MySQL..."
elapsed=0
until $DC exec -T mysql mysqladmin ping -h localhost -u firston -pfirstonpass --silent &>/dev/null 2>&1; do
  sleep 3; elapsed=$((elapsed+3)); printf "    ."
  if [ $elapsed -ge 90 ]; then echo; err "MySQL timed out → $DC logs mysql"; exit 1; fi
done
echo; ok "MySQL ready"

# ── 6. Wait: Redis ───────────────────────────────────────────
log "Waiting for Redis..."
elapsed=0
until $DC exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; do
  sleep 2; elapsed=$((elapsed+2)); printf "    ."
  if [ $elapsed -ge 30 ]; then echo; err "Redis timed out → $DC logs redis"; exit 1; fi
done
echo; ok "Redis ready"

# ── 7. Wait: LocalStack ──────────────────────────────────────
log "Waiting for LocalStack (S3 / KMS / Secrets)..."
elapsed=0
until curl -sf http://localhost:4566/_localstack/health 2>/dev/null | grep -q running; do
  sleep 3; elapsed=$((elapsed+3)); printf "    ."
  if [ $elapsed -ge 60 ]; then echo; warn "LocalStack slow — continuing"; break; fi
done
echo; ok "LocalStack ready"

# ── 8. Wait: Microservices ───────────────────────────────────
echo ""
log "Waiting for microservices..."
wait_svc() {
  local name=$1 port=$2 elapsed=0
  printf "    %-16s" "$name"
  until curl -sf "http://localhost:$port/health" &>/dev/null 2>&1; do
    sleep 2; elapsed=$((elapsed+2)); printf "."
    if [ $elapsed -ge 60 ]; then printf "  "; warn "still starting — $DC logs $name"; return; fi
  done
  printf "  ✅  :$port\n"
}
wait_svc auth         3001
wait_svc contact      3002
wait_svc calendar     3003
wait_svc pipeline     3004
wait_svc contract     3005
wait_svc messaging    3006
wait_svc sentiment    3007
wait_svc billing      3008
wait_svc notification 3009

# ── Done ─────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}══════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  🚀  FirstOn CRM is running!${NC}"
echo -e "${BOLD}${CYAN}══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${GREEN}→${NC} API Gateway    ${BOLD}http://localhost:8080${NC}"
echo -e "  ${GREEN}→${NC} Email inbox    ${BOLD}http://localhost:8025${NC}   (Mailhog)"
echo -e "  ${GREEN}→${NC} MySQL          ${BOLD}localhost:3306${NC}          (firston / firstonpass)"
echo -e "  ${GREEN}→${NC} Redis          ${BOLD}localhost:6379${NC}"
echo -e "  ${GREEN}→${NC} LocalStack     ${BOLD}http://localhost:4566${NC}"
echo ""
echo -e "  ${BOLD}Dev login (no OAuth needed):${NC}"
echo -e "  ${CYAN}curl -s -X POST http://localhost:3001/auth/dev-login \\"
echo -e "       -H 'Content-Type: application/json' \\"
echo -e "       -d '{\"email\":\"demo@firston.com.br\"}' | python3 -m json.tool${NC}"
echo ""
echo -e "  ${BOLD}Commands (all from repo root):${NC}"
echo -e "  ${YELLOW}bash stop.sh${NC}        stop containers, keep data"
echo -e "  ${YELLOW}bash reset.sh${NC}       wipe data + restart clean"
echo -e "  ${YELLOW}bash status.sh${NC}      live health dashboard"
echo -e "  ${YELLOW}bash smoke-test.sh${NC}  full API test suite"
echo -e "  ${YELLOW}$DC logs -f auth${NC}   tail a service log"
echo ""
