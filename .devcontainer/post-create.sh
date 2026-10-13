#!/usr/bin/env bash
# Runs once when the devcontainer is created.
set -euo pipefail

# named volumes can start out owned by root
sudo chown node:node node_modules /home/node/.claude /home/node/.config/netlify /home/node/.config/stripe /home/node/.cache/ms-playwright

npm ci
npx playwright install chromium

# Claude Code plugins
if ! claude plugin list 2>/dev/null | grep -q 'stripe@claude-plugins-official'; then
  claude plugin marketplace add anthropics/claude-plugins-official 2>/dev/null || true
  claude plugin install stripe@claude-plugins-official
fi

cat <<'MSG'

Devcontainer ready. Next steps (once):
  claude                     log in to Claude Code
  stripe login               link the Stripe CLI to your account (test mode)
  cp .env.example .env.local and add your Stripe test keys
Then:
  npm run dev:netlify        site + functions on http://localhost:8888
  npm run stripe:listen      forward Stripe webhooks to the local functions
  http://localhost:18025     Mailpit inbox with the order emails
MSG
