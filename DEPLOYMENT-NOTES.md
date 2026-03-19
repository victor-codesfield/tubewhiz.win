# Deployment Notes — Don't Proxy Through Cloudflare

## The Problem

When Cloudflare proxy (orange cloud) is enabled, every request goes:

```
User → Cloudflare edge → Your host (Vercel/Fly.io) → Response back through Cloudflare → User
```

Both Vercel and Fly.io already run on global edge networks with their own CDN and SSL. Adding Cloudflare proxy on top means **double edge hops** — you're paying latency for a middleman that adds nothing.

## What We Saw

With Cloudflare proxy ON for the Vercel frontend:
- **Added 50-150ms latency** per request (Cloudflare edge hop before Vercel's own edge)
- **SSL redirect loops** — Cloudflare's Flexible SSL mode clashes with Vercel's built-in SSL, causing ERR_TOO_MANY_REDIRECTS
- **Broke Vercel edge functions and ISR** — Cloudflare's caching layer interferes with Vercel's own cache invalidation

Same logic applies to `api.tubewhiz.win` on Fly.io — Fly already terminates TLS and routes to the nearest region. Cloudflare proxy just adds another network hop for zero benefit.

## The Fix

All DNS records in Cloudflare set to **DNS only** (gray cloud, proxy OFF):

| Record | Type | Target | Proxy |
|--------|------|--------|-------|
| `tubewhiz.win` | A | `76.76.21.21` | DNS only |
| `www` | CNAME | Vercel | DNS only |
| `api` | A | Fly.io IPv4 | DNS only |
| `api` | AAAA | Fly.io IPv6 | DNS only |

## The Rule

If your host already has a global edge network + managed SSL (Vercel, Fly.io, Netlify, Railway, Render), use Cloudflare as **DNS only**. Cloudflare proxy is only useful when you're running a bare origin server (VPS, EC2) that needs DDoS protection and doesn't have its own CDN.
