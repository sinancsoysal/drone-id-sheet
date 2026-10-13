FROM mcr.microsoft.com/devcontainers/typescript-node:22-trixie

# Stripe CLI, for forwarding webhooks to the local functions
RUN curl -fsSL https://packages.stripe.dev/api/security/keypair/stripe-cli-gpg/public \
      | gpg --dearmor -o /usr/share/keyrings/stripe.gpg \
  && echo "deb [signed-by=/usr/share/keyrings/stripe.gpg] https://packages.stripe.dev/stripe-cli-debian-local stable main" \
      > /etc/apt/sources.list.d/stripe.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends stripe \
  && rm -rf /var/lib/apt/lists/*

# System libraries for the Playwright version in the lockfile (the browser itself is per project)
COPY package-lock.json /tmp/lock/
RUN PW=$(node -p "require('/tmp/lock/package-lock.json').packages['node_modules/@playwright/test'].version") \
  && npx -y "playwright@${PW}" install-deps chromium \
  && rm -rf /tmp/lock /var/lib/apt/lists/* /root/.npm

# Netlify CLI runs the site and its functions together (netlify dev)
ARG NETLIFY_CLI_VERSION=27.12.0
RUN npm install -g "netlify-cli@${NETLIFY_CLI_VERSION}" && npm cache clean --force

RUN install -d -o node -g node /workspaces/drone-id-sheet/node_modules

USER node
# Claude Code (native installer, updates itself)
RUN curl -fsSL https://claude.ai/install.sh | bash
ENV PATH="/home/node/.local/bin:${PATH}" \
    CLAUDE_CONFIG_DIR=/home/node/.claude

# Mount points for the named volumes, created here so they belong to node
RUN mkdir -p /home/node/.claude /home/node/.config/netlify /home/node/.config/stripe /home/node/.cache/ms-playwright
