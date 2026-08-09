# API reference

Base URL is wherever you deployed the Worker.

Two endpoints take `Authorization: Bearer $AUTH_SECRET` and are meant to be
called from your server. The rest are hit by the user's browser and take no
credentials.

| Endpoint | Auth | Called by |
|---|---|---|
| `POST /verify/init` | `AUTH_SECRET` | your server |
| `POST /verify/exchange` | `AUTH_SECRET` | your server |
| `GET /verify` | none | the user's browser |
| `GET /callback` | none | the user's browser, via Pi |
| `POST /auth/callback` | none | the `/callback` page |
| `GET /health` | none | anything |

---

## `POST /verify/init`

Creates a verification session and returns the link to send the user to.

**Request**

```json
{
  "ref": "row-42",
  "redirect_uri": "https://yourapp.com/signin/done",
  "callback_url": "https://yourapp.com/webhook"
}
```

| Field | Required | Notes |
|---|---|---|
| `ref` | no | Opaque string handed back to you on completion. Defaults to `""`. |
| `redirect_uri` | see below | Where to send the browser afterwards, with a one-time `code`. |
| `callback_url` | see below | Webhook to POST the result to. |

At least one of `redirect_uri` and `callback_url` is required; setting both is
allowed. Both must be https, except on `localhost`, `127.0.0.1`, or `[::1]`.

**Response** `200`

```json
{
  "verify_url": "https://auth.example.com/verify?session=Xk3…",
  "session": "Xk3…",
  "expires_at": "2026-08-09T12:34:56.000Z"
}
```

**Errors**: `400` bad body or targets, `401` bad credentials.

---

## `POST /verify/exchange`

Trades the one-time `code` from a `redirect_uri` landing for the verified
identity. Codes are single-use and live for two minutes.

**Request**

```json
{ "code": "9fA…" }
```

**Response** `200`

```json
{
  "ref": "row-42",
  "uid": "a1b2c3d4-…",
  "username": "pioneer123"
}
```

**Errors**: `400` missing code, `401` bad credentials, `404` unknown,
already-spent, or expired code.

---

## `GET /verify?session=…`

Where you send the user. Redirects (`302`) to Pi Sign-in. The session token
doubles as the OAuth `state` parameter.

Renders an HTML error page on `400` (no session), `404` (unknown), `409`
(already used), or `410` (expired).

---

## `GET /callback`

The redirect URI you register in the Pi Developer Portal. Serves a small page
that reads the access token out of the URL fragment, which the browser never
sends to a server, and posts it to `/auth/callback`.

Handles Pi's four documented failure codes: `access_denied`, `expired`,
`cancelled`, `server_error`.

---

## `POST /auth/callback`

Called by the `/callback` page, not by you. Verifies the token against Pi's
`/v2/me`, fires your webhook if there is one, and mints a redirect code if
there is a `redirect_uri`.

**Response** `200`

```json
{ "status": "verified", "redirect_url": "https://yourapp.com/signin/done?code=9fA…" }
```

`redirect_url` is present only when the session had a `redirect_uri`.

**Errors**: `404` / `409` / `410` for session problems, `401` if Pi rejects
the token, `502` if Pi is unreachable or your webhook returns non-2xx.

---

## Webhook payload

What Auth314 POSTs to your `callback_url`:

```json
{
  "ref": "discord:123:456",
  "verified": true,
  "uid": "a1b2c3d4-…",
  "username": "pioneer123"
}
```

Return a 2xx. Anything else is treated as a delivery failure.

The Pi access token is never included. It stays inside Auth314 and is used
only to call `/v2/me`.
