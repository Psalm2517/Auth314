# Verifying users from a bot

Use this flow when there's no browser to return to: a Discord or Telegram
bot, a CLI, a background job. Instead of redirecting the user back, Auth314
POSTs the result to a webhook you host.

If you *are* building a website, you probably want
[the web flow](./web-apps.md) instead.

## The flow

```
1. user runs /verify in your bot
        │
2. your bot ──POST /verify/init──▶ Auth314             (AUTH_SECRET)
        │                          returns verify_url
3. bot DMs verify_url to the user
        │
4. user opens it, signs in with Pi
        │
5. Auth314 ──POST──▶ your callback_url
                     { ref, verified, uid, username }
```

## 1. Ask for a link

Set `ref` to whatever identifies the user on your platform. You'll get it back
verbatim, so it's how you know who just verified.

```js
const r = await fetch("https://auth.example.com/verify/init", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${env.AUTH_SECRET}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    ref: `discord:${guildId}:${userId}`,
    callback_url: "https://your-bot.example.com/webhook",
  }),
});

const { verify_url } = await r.json();
// Send verify_url to the user, ephemerally if your platform supports it.
```

## 2. Receive the webhook

```js
// POST /webhook  (your bot's server)
export async function onWebhook(req) {
  const { ref, verified, uid, username } = await req.json();
  if (!verified) return new Response("ok");

  const [platform, guildId, userId] = ref.split(":");
  await grantRole(guildId, userId);
  await db.verified.put({ platform, guildId, userId, piUid: uid });

  return new Response("ok", { status: 200 });
}
```

**Return a 2xx.** Auth314 treats a non-2xx as a delivery failure and reports
`502` back to the user's browser, which will make them think verification
failed. The Pi sign-in itself already succeeded at that point.

## Discord specifics

A Discord bot doesn't need a gateway connection for this. Slash commands can
arrive over HTTP, so the whole bot fits in the same kind of Worker Auth314
runs on.

- Reply to `/verify` **ephemerally** so the link isn't visible to the channel.
  Verification links are single-use, but they're still a link to a sign-in.
- Key `ref` on `guild_id` **and** `user_id` if roles are per-server.
- Store `uid` if you want to detect one Pi account claiming several Discord
  accounts. Because Pi scopes `uid` per app, this only works within your own
  app. You cannot correlate against anyone else's.
- Assigning a role needs `Manage Roles`, and the bot's own role must sit
  **above** the role it's granting in the server's role list. Discord returns
  `403 Missing Access` when it doesn't.

## Notes

**Links expire in ten minutes and work once.** Have your bot re-issue on
demand rather than caching one.

**`callback_url` must be https**, except on `localhost`, `127.0.0.1`, or
`[::1]` for local development.

**You can set both `callback_url` and `redirect_uri`.** The webhook fires and
the browser still gets sent somewhere. Useful if you want the user to land on
a real "you're verified" page instead of Auth314's default one.
