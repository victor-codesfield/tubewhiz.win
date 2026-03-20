# TubeWhiz

**YouTube transcript extraction, AI chat, and library management.**

Live at [tubewhiz.win](https://tubewhiz.win)

---

## Background

TubeWhiz started as a Python-based YouTube scraper — worked locally but consistently failed in production due to YouTube's aggressive anti-scraping measures. After iterating on the Python stack, we pivoted to a Node.js backend using the **innertube player API** (the same internal API YouTube's mobile apps use) combined with **rotating residential proxies** from Webshare to avoid IP-based rate limiting.

The scraping library we use is actively maintained and frequently updated — important because YouTube regularly changes their anti-scraping defenses. The data being extracted (video transcripts/captions) is publicly available content that YouTube surfaces to all viewers.

The original plan was to build a Chrome extension similar to Tactiq/Transcribr.io. We quickly realized that Chrome Web Store review/approval cycles (days to weeks per update) made it impractical to iterate and troubleshoot at the speed needed — especially when YouTube makes breaking changes to their API. Shipping as a **web app** gives us instant deployments and the ability to push fixes in minutes, not days.

The extension code (`extension-new/`) still exists in the architecture but the web app (`web/`) is the primary product.

## What it does

Paste any YouTube URL — get the full transcript instantly. Save to your library, chat with AI about the content, or bulk-extract an entire channel's transcripts at once.

- **Individual extraction** — paste a video URL, get the transcript in seconds
- **Bulk channel extraction** — enter a channel URL, extract all videos with progress tracking
- **AI chat** — ask questions about any transcript using GPT-4o
- **Library** — save, browse, and manage transcripts with search
- **Credit system** — duration-based pricing (1 minute of video = 1 credit minute)

## Tech stack

| Layer | Tech | Hosting |
|-------|------|---------|
| Frontend | Vite + React 18 + Tailwind CSS | Vercel |
| Backend | Express + Mongoose | Fly.io |
| Database | MongoDB Atlas | — |
| AI | OpenAI GPT-4o | — |
| Auth | Google OAuth 2.0 + JWT | — |
| Proxy | Webshare residential proxies | — |

### How transcripts are fetched

YouTube blocks server-side scraping. TubeWhiz uses the **YouTube innertube player API** — the same internal API that YouTube's mobile apps use — with ANDROID and IOS client fallbacks, routed through rotating residential proxies to avoid rate limiting.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full technical deep dive.

## Project structure

```
tubewhiz.win/
├── backend-new/     Express API (Fly.io)
├── web/             Vite + React dashboard (Vercel)
├── ARCHITECTURE.md  Full system architecture
└── DEPLOYMENT-NOTES.md  Cloudflare DNS/proxy notes
```

## Local development

### Backend

```bash
cd backend-new
npm install
cp .env.example .env   # fill in your keys
npm run dev             # http://localhost:4000
```

### Frontend

```bash
cd web
npm install
npm run dev             # http://localhost:3000 (proxies /api → localhost:4000)
```

### Environment variables

See [ARCHITECTURE.md → Environment Variables](ARCHITECTURE.md#environment-variables) for the full list.

## Deployment

- **Frontend** — auto-deploys to Vercel on push to `main`
- **Backend** — auto-deploys to Fly.io via GitHub Actions on push to `main`
- **DNS** — Cloudflare (DNS only, no proxy) — see [DEPLOYMENT-NOTES.md](DEPLOYMENT-NOTES.md) for why

---

Built by [Victor Codesfield](https://github.com/victor-codesfield)
