const STYLE = `
  :root { color-scheme: dark }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#0d0d12; color:#e8e8f0; font:15px/1.5 system-ui,-apple-system,sans-serif }
  .card { max-width:340px; padding:32px; text-align:center }
  h1 { font-size:17px; margin:0 0 8px }
  p { margin:0; color:#8888a0; font-size:14px }
  .mark { font-size:32px; line-height:1; margin-bottom:12px }
  .ok { color:#4ade80 } .bad { color:#e5484d }
`;

function page(body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Verification</title><style>${STYLE}</style></head>
<body><div class="card" id="root">${body}</div></body></html>`;
}

/**
 * Served at the OAuth redirect_uri. Pi returns the access token in the URL
 * fragment, which browsers never send to the server, so this page reads it
 * client-side and POSTs it back to /auth/callback.
 */
export function callbackPage(apiBase: string): string {
  const body = `<div class="mark">&middot;&middot;&middot;</div>
<h1>Verifying…</h1><p>One moment.</p>
<script>
(function () {
  var root = document.getElementById("root");
  function show(cls, mark, title, msg) {
    root.innerHTML = '<div class="mark ' + cls + '">' + mark + "</div><h1>" +
      title + "</h1><p>" + msg + "</p>";
  }
  // Pi returns exactly these four error codes in the fragment.
  var ERRORS = {
    access_denied: ["Sign-in declined", "You declined the consent screen."],
    expired: ["Sign-in expired", "The sign-in request timed out. Please start over."],
    cancelled: ["Sign-in cancelled", "You cancelled before approving."],
    server_error: ["Pi had a problem", "Pi reported an unexpected error. Please try again."]
  };
  var hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  var token = hash.get("access_token");
  var state = hash.get("state");
  var err = hash.get("error");
  if (err) {
    var known = ERRORS[err];
    return show("bad", "\\u2715", known ? known[0] : "Sign-in failed", known ? known[1] : err);
  }
  if (!token || !state) {
    return show("bad", "\\u2715", "Something went wrong", "This link is missing sign-in data. Please start over.");
  }
  history.replaceState(null, "", location.pathname);
  fetch(${JSON.stringify(apiBase)} + "/auth/callback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_token: token, session: state })
  })
    .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
    .then(function (res) {
      if (!res.ok) throw new Error(res.d && res.d.error ? res.d.error : "Verification failed");
      // Web flow: hand the user back to the app that started this.
      if (res.d && res.d.redirect_url) {
        location.replace(res.d.redirect_url);
        return;
      }
      show("ok", "\\u2713", "Verified", "You can close this window.");
    })
    .catch(function (e) { show("bad", "\\u2715", "Verification failed", e.message); });
})();
</script>`;
  return page(body);
}

export function errorPage(message: string): string {
  return page(
    `<div class="mark bad">&#10005;</div><h1>Something went wrong</h1><p>${escapeHtml(message)}</p>`,
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default: return "&#39;";
    }
  });
}
