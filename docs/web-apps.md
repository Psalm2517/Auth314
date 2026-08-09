# Sign in with Pi, from a web app

This is the flow you want if you're building an actual site or Pi app and you
need a logged-in user at the end of it.

Pi Sign-in only offers the OAuth **implicit** flow: the access token arrives in
a URL fragment, which the browser never sends to a server, so Pi's own guide
tells you to read it in front-end JavaScript. Auth314 turns that into the
**authorization-code** shape you already know — the browser comes back to your
site with a `code`, and your server trades it for the identity.

Your front-end writes nothing.

## The flow

```
1. user clicks "Sign in with Pi"
        │
2. your server ──POST /verify/init──▶ Auth314          (AUTH_SECRET)
        │                              returns verify_url
3. redirect the browser to verify_url
        │
4. Auth314 → Pi Sign-in → back to Auth314's /callback
        │
5. Auth314 redirects the browser to
   your redirect_uri?code=…
        │
6. your server ──POST /verify/exchange──▶ Auth314      (AUTH_SECRET)
                                          returns { ref, uid, username }
7. mint your own session
```

## 1. Start the sign-in

When the user clicks your button, ask Auth314 for a link. Do this **on your
server** — `AUTH_SECRET` must never reach the browser.

Set `ref` to a random per-attempt value that you also store in the visitor's
session. When the code comes back, you'll compare them. That's your CSRF
binding, and it's the same job OAuth's `state` parameter normally does.

```js
// POST /signin  (your server)
const ref = crypto.randomUUID();
req.session.piRef = ref;

const r = await fetch("https://auth.example.com/verify/init", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.AUTH_SECRET}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    ref,
    redirect_uri: "https://yourapp.com/signin/done",
  }),
});

const { verify_url } = await r.json();
res.redirect(verify_url);
```

## 2. Handle the landing

Auth314 sends the browser back to your `redirect_uri` with `?code=…`. Any
query string already on your `redirect_uri` is preserved, so
`https://yourapp.com/signin/done?next=/dashboard` works fine.

```js
// GET /signin/done  (your server)
const { code } = req.query;

const r = await fetch("https://auth.example.com/verify/exchange", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.AUTH_SECRET}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ code }),
});

if (!r.ok) return res.status(400).send("Sign-in failed");
const { ref, uid, username } = await r.json();

// Confirm this is the same attempt this browser started.
if (ref !== req.session.piRef) return res.status(400).send("Session mismatch");
delete req.session.piRef;

// uid is your primary key. Mint your own session.
const user = await db.users.upsert({ piUid: uid, piUsername: username });
req.session.userId = user.id;
res.redirect("/dashboard");
```

That's the whole integration.

## Notes

**`uid` is your primary key, not `username`.** Pi scopes `uid` to your app and
it's stable; usernames are not guaranteed to be. From Pi's guide: "The same Pi
user gets a different `uid` in a different app, so two apps cannot correlate
the same person."

**Codes are single-use and expire in two minutes.** Exchange immediately on
landing. A replayed code returns `404`.

**Verification links are single-use and expire in ten minutes.** If the user
sits on the Pi consent screen too long, they'll need to start over.

**Local development.** `redirect_uri` must be https, except on `localhost`,
`127.0.0.1`, or `[::1]`, where http is allowed — the same rule Pi applies in
the Developer Portal.

**Auth314's own callback stays registered with Pi, not yours.** The redirect
URI you register in the Pi Developer Portal is
`https://your-auth314-deployment/callback`. Your app's `redirect_uri` is
between your app and Auth314, and Pi never sees it.
