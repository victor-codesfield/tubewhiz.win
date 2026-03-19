# TubeWhiz

**YouTube transcript extraction, AI chat, and library management.**

Live at [tubewhiz.win](https://tubewhiz.win)

---

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

Built by [Victor Jarmolkovicius](https://github.com/victor-codesfield)
