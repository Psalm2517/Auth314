<div align="center">

<img src="./auth314-logo-tp.svg" width="88" alt="Auth314 logo">

# Auth314

**A self-hosted solution that simplifies the Pi Sign-in OAuth flow.**

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)
[![CI](https://github.com/Psalm2517/auth314/actions/workflows/ci.yml/badge.svg)](https://github.com/Psalm2517/auth314/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org)

</div>

---

Pi Sign-in is an implicit-flow OAuth integration: you have to redirect the
user, catch an access token out of a URL fragment in the browser, and verify
it against Pi's API before you can trust it. Auth314 does all of that for you.

You make one API call, send the user a link, and get a webhook back telling
you they verified. Auth314 is not affiliated with Pi Network or the Pi Core
Team.

Runs on **Cloudflare Workers** or **Vercel**.

## How it works

```
POST /verify/init  ──▶  { verify_url }
                             │
        send verify_url to your user
                             │
                             ▼
     Auth314 redirects them to Pi Sign-in, handles the
     OAuth round trip, and verifies the token with Pi
                             │
                             ▼
        POST to your callback_url: { ref, verified: true }
```

Everything the user sees is served by Auth314. There is no page for you to
build.

## Usage

Ask for a verification link, passing any `ref` you want echoed back (a user
id, a row id, anything):

```bash
curl -X POST https://your-deployment/verify/init \
  -H "Authorization: Bearer $AUTH_SECRET" \
  -H "Content-Type: application/json" \
  -d '{ "ref": "discord:1154371492537188465",
        "callback_url": "https://your-app.example/webhook" }'
```

```json
{
  "verify_url": "https://your-deployment/verify?session=Xk3…",
  "session": "Xk3…",
  "expires_at": "2026-08-05T12:34:56.000Z"
}
```

Send the user `verify_url`. When they finish, Auth314 POSTs to your
`callback_url`:

```json
{ "ref": "discord:1154371492537188465", "verified": true }
```

Links are one-time use and expire after 10 minutes.

Pi identity (UID and username) never leaves Auth314 and is deliberately not
included in the webhook, per Pi's Developer Terms of Use.

## Endpoints

| Endpoint | Auth | Description |
|---|---|---|
| `POST /verify/init` | `AUTH_SECRET` | Creates a session, returns a `verify_url` |
| `GET /verify` | — | Where the user lands; redirects to Pi Sign-in |
| `GET /callback` | — | OAuth redirect target; completes the flow |
| `GET /verify/status` | — | Checks whether a session is still valid |
| `POST /auth/callback` | — | Called by the callback page; fires your webhook |
| `GET /health` | — | Health check |

## Setup

You'll need a Pi app registered in the [Pi Developer
Portal](https://minepi.com/developers/) to get a `client_id`.

### Cloudflare Workers

```bash
npm install
npx wrangler kv namespace create AUTH314_KV   # paste the id into wrangler.toml
# set PI_CLIENT_ID in wrangler.toml
npx wrangler secret put AUTH_SECRET
npx wrangler deploy
```

### Vercel

Create an [Upstash Redis](https://upstash.com) database (or Vercel KV) and
link it to the project, then:

```bash
npm install -g vercel
vercel env add AUTH_SECRET
vercel env add PI_CLIENT_ID
vercel deploy
```

`KV_REST_API_URL` / `KV_REST_API_TOKEN` are set for you when you link the
store. `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` also work.

### Finally

Register `https://your-deployment/callback` as a redirect URI on your Pi app.
It must match exactly.

## Configuration

| Name | Required | Description |
|---|---|---|
| `AUTH_SECRET` | yes | Bearer token your integration sends to `/verify/init` |
| `PI_CLIENT_ID` | yes | Pi OAuth client id (public) |
| `PUBLIC_URL` | no | Override the public base URL, if behind a proxy |

## Layout

```
src/core/       platform-agnostic request handling
src/adapters/   thin per-platform entry points (cloudflare, vercel)
```

Adding a platform means implementing a three-method `SessionStore` and
passing a `Config` to `handleRequest`.

## License

Apache 2.0. See [LICENSE](./LICENSE).
