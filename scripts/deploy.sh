#!/usr/bin/env bash
# Deploy JARVIS to the VPS: the server pulls the pushed commit from GitHub.
#
#   ./scripts/deploy.sh                 # uses JARVIS_DEPLOY_HOST (default below)
#   JARVIS_DEPLOY_HOST=user@host ./scripts/deploy.sh
#
# Requirements: commit + push first (the VPS deploys origin/main, not your working tree).
set -euo pipefail

HOST="${JARVIS_DEPLOY_HOST:-jarvis@212.56.33.113}"
APP_DIR="${JARVIS_APP_DIR:-JARVIS}"   # relative to the remote user's home
BRANCH="main"

cd "$(dirname "$0")/.."

# ----- Local checks -----
if [ -n "$(git status --porcelain)" ]; then
  echo "✗ Há mudanças não commitadas. Faça commit (e push) antes do deploy." >&2
  exit 1
fi
git fetch -q origin "$BRANCH"
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$BRANCH")
if [ "$LOCAL" != "$REMOTE" ]; then
  echo "✗ Seu HEAD ($(git rev-parse --short HEAD)) não é o origin/$BRANCH ($(git rev-parse --short "origin/$BRANCH")). Rode git push primeiro." >&2
  exit 1
fi

echo "→ Deploy de $(git log -1 --format='%h %s') em $HOST"

# ----- Remote -----
ssh "$HOST" APP_DIR="$APP_DIR" BRANCH="$BRANCH" 'bash -s' <<'REMOTE_SCRIPT'
set -euo pipefail
cd "$HOME/$APP_DIR"

PREV=$(git rev-parse HEAD)
git fetch -q origin "$BRANCH"
git merge --ff-only -q "origin/$BRANCH"
NEW=$(git rev-parse HEAD)

if [ "$PREV" = "$NEW" ]; then
  echo "  já está na versão $(git rev-parse --short HEAD)"
fi

# Reinstall dependencies only when they changed (or were never installed)
if [ ! -d node_modules ] || ! git diff --quiet "$PREV" "$NEW" -- package.json package-lock.json; then
  echo "  instalando dependências..."
  npm ci --no-audit --no-fund
fi

BROWSERSLIST_IGNORE_OLD_DATA=1 npm run -s build:css
pm2 restart jarvis --update-env > /dev/null

# Health check: the login page must answer within ~10s
for i in $(seq 1 10); do
  if curl -fs -o /dev/null http://127.0.0.1:3000/login.html; then
    echo "✓ No ar: $(git log -1 --format='%h %s')"
    exit 0
  fi
  sleep 1
done

echo "✗ O servidor não respondeu. Logs: pm2 logs jarvis" >&2
echo "  Para voltar: cd ~/$APP_DIR && git reset --hard $PREV && npm run build:css && pm2 restart jarvis" >&2
exit 1
REMOTE_SCRIPT
