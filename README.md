<div align="center">

<img src="./auth314-logo-tp.svg" width="88" alt="Auth314 logo">

# Auth314

**Pi Sign-in, handled end to end.**

Self-hosted on Cloudflare Workers.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![CI](https://github.com/Psalm2517/Auth314/actions/workflows/ci.yml/badge.svg)](https://github.com/Psalm2517/Auth314/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org)

[Web apps](./docs/web-apps.md) · [Bots](./docs/bots.md) · [API reference](./docs/api.md) · [Setup](#setup)

</div>

---

You deploy Auth314 to your own Cloudflare account. Your app hands it a user,
Auth314 runs the entire Pi Sign-in round trip, and you get back a verified Pi
identity. Everything in between is already written: the redirect out, the
browser page that catches the token, CSRF, error states, expiry.

There is no hosted version and no account to sign up for. This is the whole
project.

## Two ways to use it

**Building a website or Pi app?** Auth314 gives you an authorization-code
flow: the browser comes back to your site with a `code`, your server trades it
for the identity, and you mint your own session. → **[docs/web-apps.md](./docs/web-apps.md)**

**Building a bot?** There's no browser to return to, so Auth314 POSTs the
result to your webhook instead. → **[docs/bots.md](./docs/bots.md)**

You can use both at once.

## Why not just follow Pi's docs?

[Pi's Sign-in guide](https://github.com/pi-apps/pi-platform-docs/blob/master/pi-sign-in.md)
is good, and you should read it. But it documents a flow that leaves real work
on your side of the line:

**Pi only offers the implicit flow.** The token comes back in a URL fragment,
so, per Pi's guide:

> "You must read the token in your front-end (JavaScript code). You cannot
> directly read it from the server, because the fragment (`#`) is never sent
> to your server by the browser."

Auth314 hosts that page and converts the whole thing into a code exchange your
server can do. You write no front-end JavaScript at all, which also means a
bot, a CLI, or any backend without a web front-end can use Pi Sign-in without
standing up a page purely to catch a fragment.

**CSRF is left to you.** Pi's guide says "Always verify `state` before trusting
the response" and leaves you storing a random value in `sessionStorage`.
Auth314 makes `state` the verification session itself: a 192-bit token that
only exists server-side, is single-use, and expires in ten minutes. A forged
`state` isn't "mismatched", it's simply not a session.

**Error handling is left to you.** Pi can return `access_denied`, `expired`,
`cancelled`, or `server_error` in the fragment. Auth314 handles all four and
shows the user a real message.

**Session-building is left to you.** Pi's token is single-use with no refresh:
"read the identity once and mint your own session." Auth314 does the reading
and hands you the result, so the only thing you write is the part that was
always going to be app-specific.

**What Auth314 does not replace:** the [Pi Developer
Portal](https://minepi.com/developers/). You still register your app there,
verify your domain, get your `client_id`, and register a redirect URI. Auth314
sits on top of that, not instead of it.

## Quick look

Web app, server-side:

```js
// 1. start
const { verify_url } = await auth314("/verify/init", {
  ref, redirect_uri: "https://yourapp.com/signin/done",
});
redirect(verify_url);

// 2. they come back to /signin/done?code=…
const { uid, username } = await auth314("/verify/exchange", { code });
```

Bot:

```js
const { verify_url } = await auth314("/verify/init", {
  ref: `discord:${guildId}:${userId}`,
  callback_url: "https://your-bot.example.com/webhook",
});
// later, at your webhook: { ref, verified, uid, username }
```

## Setup

### What you actually need

Two accounts and two values. That's the whole list.

| | |
|---|---|
| A Cloudflare account | free tier is fine |
| A Pi app with Pi Sign-in enabled | gives you `PI_CLIENT_ID` |
| `AUTH_SECRET` | any random string; `npm run setup` generates one |

There is no database to run, no Pi client secret (Pi doesn't issue one), and
nothing in this repo you have to hand-edit.

### 1. Register a Pi app

In the [Pi Developer Portal](https://minepi.com/developers/): verify your
domain, enable Pi Sign-in, and copy the `client_id`.

Leave the redirect URI for step 4, since you don't know your Worker's URL yet.

### 2. Deploy the Worker

One click, which forks the repo to your account and deploys it:

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Psalm2517/Auth314)

Or from your machine:

```bash
git clone https://github.com/Psalm2517/Auth314.git && cd Auth314
npm install
npx wrangler deploy
```

Either way, the KV namespace is created for you on first deploy.

### 3. Set your config

```bash
npm run setup
```

Prompts for the two required values, generates `AUTH_SECRET` if you don't have
one, writes `.dev.vars` for local development, and offers to push both to
Cloudflare. Re-run it any time to rotate.

If you deployed with the button, set the same two names under your Worker's
Settings then Variables in the Cloudflare dashboard.

Until both are set, every request returns a `500` naming what's missing.

### 4. Register the redirect URI

Back in the Pi Developer Portal, add `https://your-deployment/callback` as a
redirect URI. It must match exactly.

## Configuration

Both required values are set as Cloudflare secrets, so `wrangler.toml` never
needs editing. Locally they come from `.dev.vars`
(see [.dev.vars.example](./.dev.vars.example)).

**Required**

| Name | Description |
|---|---|
| `PI_CLIENT_ID` | Pi OAuth client id. Public value; Pi issues no secret. |
| `AUTH_SECRET` | Bearer token your server sends to `/verify/init` and `/verify/exchange`. |

**Optional**

| Name | Default | Description |
|---|---|---|
| `PUBLIC_URL` | the request's own origin | Set only if you're behind a proxy that rewrites `Host`. |

## What you get back

The verified `uid` and `username`. Auth314 runs inside your own stack, so this
is an internal hop. You registered the Pi app that minted the `uid`, and you
run both this worker and whatever receives the result.

Pi's Sign-in guide tells you to "use this `uid` as the primary key for the
user's account in your system." The `uid` is scoped per-app, so it isn't a
cross-app identifier:

> "The same Pi user gets a different `uid` in a different app, so two apps
> cannot correlate the same person."

**If you relay this onward,** note that [Pi's Developer Terms of
Use](https://socialchain.app/developer_terms) §4 bars transferring "user IDs,
usernames, UIDs" except "with a service provider who helps you build, run, or
operate your App". Keeping it inside your own systems is fine; forwarding it
to an outside party is a §4 transfer and your obligation to get right.

The Pi access token never leaves Auth314.

## Layout

```
src/worker.ts   Cloudflare entry point: bindings in, Config out
src/core/       everything else, with no Cloudflare imports
```

Core reaches storage through a three-method `SessionStore`, so the only
Cloudflare-aware file is `worker.ts`.

## License

MIT. See [LICENSE](./LICENSE).

Auth314 is an independent project. It is not affiliated with, endorsed by, or
sponsored by the Pi Community Company or the Pi Core Team.

Pi, Pi Network and the Pi logo are trademarks of the Pi Community Company.

<div align="center">
<br>

[![Built with Cloudflare Workers](https://img.shields.io/badge/Built%20with-Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com)

</div>
