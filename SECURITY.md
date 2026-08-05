# Security Policy

## Reporting a vulnerability

If you find a security vulnerability in Auth314, please **do not open a public
GitHub issue**. Email **hello@auth314.com** with:

- A description of the vulnerability and its impact
- Steps to reproduce it
- Any proof-of-concept code, if applicable

We'll acknowledge your report within 48 hours and aim to have a fix or
mitigation plan within 7 days for confirmed high-severity issues. We'll credit
you in the fix (unless you'd prefer to stay anonymous).

## Scope

This applies to the Auth314 core service in this repository. Auth314 is
self-hosted -- there is no hosted instance to report against, and the security
of any given deployment is the operator's responsibility. Pi Network's own
infrastructure is out of scope; report those issues to the Pi Core Team
directly.

## What we consider in scope

- Authentication or authorization bypass on `/verify/init`
- Leaking Pi identity (UID, username) into a webhook payload or any other
  response it shouldn't reach
- Forging or replaying verification webhooks
- Session token prediction, reuse, or fixation
- Injection or SSRF in the Worker
- Secrets or credentials committed to this repo

## Out of scope

- Missing security headers with no demonstrated impact
- Denial of service
- Social engineering
- Misconfiguration of a self-hosted deployment (weak `AUTH_SECRET`, exposed
  KV namespace, etc.)
