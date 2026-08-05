<div align="center">

<img src="./auth314-logo-tp.svg" width="88" alt="Auth314 logo">

# Auth314

**A self-hosted core service that simplifies the Pi Sign-in OAuth flow.**

[![License: AGPL v3](https://img.shields.io/badge/License-AGPLv3-blue.svg)](./LICENSE)
[![CI](https://github.com/Psalm2517/auth314/actions/workflows/ci.yml/badge.svg)](https://github.com/Psalm2517/auth314/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-f38020.svg?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com)

</div>

---

Auth314 runs the Pi Network OAuth flow for you and delivers a single signal to
a webhook: whether a user successfully verified their Pi account. It exists so
you don't have to build and maintain a Pi OAuth integration yourself.

This is the core service only. There is no hosted version, no dashboard, and
no API key system. You deploy it to your own Cloudflare account and point your
own bots or apps at it. Auth314 is not affiliated with Pi Network or the Pi
Core Team.

Per Pi's Developer Terms of Use, a user's Pi identity (UID and username) stays
internal to this service and is never forwarded in the webhook payload.

## How it works

1. Your integration calls `POST /verify/init` with the shared `AUTH_SECRET`, a
   `platform_user_id` to verify, and a `callback_url` to receive the result.
   Auth314 returns a `verify_url`.
2. The end user opens `verify_url` and completes the Pi Sign-in OAuth flow
   against Pi Network's own servers.
3. Auth314 verifies the resulting access token against the Pi Platform API and
   POSTs a one-time result to your `callback_url`:
   `{ platform_user_id, guild_id, verified: true }`.

Each Pi account maps to exactly one verified platform identity at a time.
Re-verifying with a different platform account automatically revokes the
previous association.

## What you need to provide

This repo contains the Worker API only. To run a complete flow you also need a
web page of your own that:

- reads the `session` query parameter from `verify_url`,
- runs the Pi Sign-in flow with the Pi SDK,
- POSTs the resulting `access_token` and `session` to `/auth/callback`.

Set `PORTAL_BASE_URL` in `wrangler.toml` to that page's URL.

## Endpoints

| Endpoint | Auth | Description |
|---|---|---|
| `POST /verify/init` | `AUTH_SECRET` | Creates a session, returns a `verify_url` |
| `GET /verify/status` | none | Checks whether a session is still valid |
| `POST /auth/callback` | none | Completes verification and delivers the webhook |
| `GET /health` | none | Health check |

## Setup

```bash
cd worker && npm install

# Create your KV namespace and paste the id into wrangler.toml
npx wrangler kv:namespace create AUTH314_KV

# Set secrets
npx wrangler secret put PI_API_KEY
npx wrangler secret put AUTH_SECRET

npx wrangler deploy
```

See [.env.example](./.env.example) for the full list of configuration values.

## License

AGPL-3.0. See [LICENSE](./LICENSE).
