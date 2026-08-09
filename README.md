<div align="center">

<img src="./auth314-logo-tp.svg" width="88" alt="Auth314 logo">

# Auth314

**Self-hosted Pi Sign-in, handled end to end.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![CI](https://github.com/Psalm2517/auth314/actions/workflows/ci.yml/badge.svg)](https://github.com/Psalm2517/auth314/actions/workflows/ci.yml)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-f38020.svg?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com)

</div>

---

You deploy Auth314 to your own Cloudflare account. Your app calls it, sends
the user a link, and gets a webhook back when they've verified their Pi
account. Everything in between — the redirect out, the browser page that
catches the token, CSRF, errors, expiry — is already written.

There is no hosted version and no account to sign up for. This is the whole
project.

## Why not just follow Pi's docs?

[Pi's Sign-in guide](https://github.com/pi-apps/pi-platform-docs/blob/master/pi-sign-in.md)
is good, and you should read it. But it documents a flow that leaves real work
on your side of the line:

**You have to ship front-end JavaScript.** Pi Sign-in is implicit-flow OAuth,
so the token comes back in the URL fragment. From Pi's guide:

> "You must read the token in your front-end (JavaScript code). You cannot
> directly read it from the server, because the fragment (`#`) is never sent
> to your server by the browser."

That's unavoidable — but it doesn't have to be *yours*. Auth314 hosts that
page. If your app is a Discord bot, a CLI, a mobile backend, or anything else
without a web front-end, this is otherwise a page you'd have to build and
deploy for no other reason.

**CSRF is left to you.** Pi's guide says "Always verify `state` before
trusting the response" and shows you storing a random value in
`sessionStorage` to compare against. Auth314 makes `state` the verification
session itself — a 192-bit token that only exists server-side in KV, is
single-use, and expires in 10 minutes. A replayed or forged `state` isn't
"mismatched", it's simply not a session.

**Error handling is left to you.** Pi can return `access_denied`, `expired`,
`cancelled`, or `server_error` in the fragment. Auth314 handles all four and
shows the user a real message.

**Session-building is left to you.** Pi's token is single-use and has no
refresh: "read the identity once and mint your own session." Auth314 does the
reading and hands you the result over a webhook, so the only thing you write
is the part that was always going to be app-specific.

**What Auth314 does not replace:** the [Pi Developer
Portal](https://minepi.com/developers/). You still register your app there,
verify your domain, get your `client_id`, and register redirect URIs. Auth314
sits on top of that, not instead of it.

## How it works

```
POST /verify/init  ──▶  { verify_url }
                             │
        send verify_url to your user
                             │
                             ▼
        Auth314 redirects to Pi, hosts the callback page,
        verifies the token against Pi's /v2/me
                             │
                             ▼
        POST to your callback_url:
        { ref, verified: true, uid, username }
```

## Usage

Ask for a link, passing any `ref` you want echoed back — a user id, a row id,
anything meaningful to you:

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
  "expires_at": "2026-08-09T12:34:56.000Z"
}
```

Send the user `verify_url`. When they finish, Auth314 POSTs to your
`callback_url`:

```json
{
  "ref": "discord:1154371492537188465",
  "verified": true,
  "uid": "a1b2c3d4-…",
  "username": "pioneer123"
}
```

Links are single-use and expire after 10 minutes.

## What lands in your webhook

You get the verified `uid` and `username`. Auth314 is embedded in your own
stack, so this is an internal hop — you registered the Pi app that minted the
`uid`, and you run both this worker and the `callback_url` it posts to.

Pi's Sign-in guide tells you to "use this `uid` as the primary key for the
user's account in your system", which you can't do if the thing running your
sign-in never hands it over. The `uid` is also scoped per-app, so it isn't a
cross-app identifier:

> "The same Pi user gets a different `uid` in a different app, so two apps
> cannot correlate the same person."

**One thing to know if you relay this onward.**
[Pi's Developer Terms of Use](https://socialchain.app/developer_terms) §4 says
you shall not "transfer[] or share[] user IDs, usernames, UIDs, or your access
token, Developer credentials and secret key, **except with a service provider
who helps you build, run, or operate your App**". Keeping the payload inside
your own systems is fine. Forwarding it to an outside party is a §4 transfer
and your obligation to get right — strip the fields in your own webhook
handler if you need to.

Auth314 requests only the `username` scope. It never asks for
`wallet_address`.

## Endpoints

| Endpoint | Auth | Description |
|---|---|---|
| `POST /verify/init` | `AUTH_SECRET` | Creates a session, returns a `verify_url` |
| `GET /verify` | — | Where you send the user; redirects to Pi |
| `GET /callback` | — | OAuth redirect target; hosts the fragment-reading page |
| `POST /auth/callback` | — | Called by that page; verifies and fires your webhook |
| `GET /health` | — | Health check |

## Setup

You need a Pi app in the [Pi Developer Portal](https://minepi.com/developers/)
with a verified domain and Pi Sign-in enabled, which gives you a `client_id`.

```bash
git clone https://github.com/Psalm2517/Auth314.git && cd Auth314
npm install

# Create your KV namespace, then paste the id into wrangler.toml
npx wrangler kv namespace create AUTH314_KV

# Put your client_id in wrangler.toml, then set the shared secret
npx wrangler secret put AUTH_SECRET   # openssl rand -base64 32

npx wrangler deploy
```

Finally, register `https://your-deployment/callback` as a redirect URI on your
Pi app. It must match exactly.

## Configuration

| Name | Where | Required | Description |
|---|---|---|---|
| `AUTH_SECRET` | secret | yes | Bearer token your app sends to `/verify/init` |
| `PI_CLIENT_ID` | `[vars]` | yes | Pi OAuth client id (public; Pi issues no secret) |
| `PUBLIC_URL` | `[vars]` | no | Override the public base URL, if behind a proxy |

## Layout

```
src/core/       platform-agnostic request handling
src/adapters/   per-platform entry point (cloudflare)
```

Core talks to storage through a three-method `SessionStore`, so it has no
Cloudflare dependency of its own. Only the adapter does.

## License

MIT. See [LICENSE](./LICENSE).

Auth314 is an independent project. It is not affiliated with, endorsed by, or
sponsored by the Pi Community Company or the Pi Core Team.

Pi, Pi Network and the Pi logo are trademarks of the Pi Community Company.
