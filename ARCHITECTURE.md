# TubeWhiz — Architecture

> YouTube transcript extraction, library management, and AI chat.
> Built by Victor Codesfield as a showcase project.

---

## High-Level Overview

```
┌─────────────┐      ┌──────────────┐      ┌──────────────────┐
│  Chrome      │      │  Web App     │      │  Landing Page    │
│  Extension   │      │  (Vite+React)│      │  (Next.js 15)    │
│  MV3         │      │  Vercel      │      │  (not deployed)  │
└──────┬───────┘      └──────┬───────┘      └──────────────────┘
       │                     │
       │   JWT Bearer Auth   │
       └────────┬────────────┘
                │  HTTPS
                ▼
        ┌───────────────┐
        │  Express API  │
        │  Fly.io (iad) │
        │  Port 4000    │
        └───────┬───────┘
                │
       ┌────────┼─────────┐
       ▼        ▼         ▼
   MongoDB   YouTube   OpenAI
   Atlas     APIs      GPT-4o
```

**Four apps, one repo (monorepo-style, no workspace tooling):**

| App | Dir | Stack | Hosting | URL |
|-----|-----|-------|---------|-----|
| Web dashboard | `web/` | Vite + React 18 + Tailwind | Vercel (auto-deploy on push) | tubewhiz.win |
| API backend | `backend-new/` | Express + Mongoose | Fly.io (GitHub Actions on push to main) | api.tubewhiz.win |
| Chrome extension | `extension-new/` | Chrome MV3 + React + Vite | Chrome Web Store | — |
| Marketing landing | `landing-new/` | Next.js 15 + React 19 + Tailwind | Not deployed | — |

---

## Backend (`backend-new/`)

### Server (`server.js`)
- Express with Helmet, CORS, JSON (50MB limit), cookie-parser
- CORS allows: `localhost:3000/3001/4000`, `tubewhiz.win`, `chrome-extension://*`
- Request logging middleware (method, path, duration)
- Health check at `/health`, info at `/`

### Routes

**`/api/auth/*`** — `routes/authRoutes.js`
- `POST /google` — Google OAuth token → userinfo lookup → find-or-create user → JWT (30d)
- `POST /dev` — Dev bypass login (non-production only)
- `GET /profile` — Return current user
- `POST /purchase-intent` — Records `clickedPurchase: true` and increments `wantsToPayUSD` (demand signal, no real payments yet)

**`/api/youtube/*`** — `routes/youtubeRoutes.js`
- `POST /fetch-transcript` — The core extraction endpoint:
  1. Looks up video metadata via YouTube Data API (`snippet` + `contentDetails`) for title, channel, duration
  2. Calculates `minutesNeeded = ceil(duration_seconds / 60)`, minimum 1
  3. Checks user's `creditMinutes` balance, returns 402 if insufficient
  4. Fetches transcript server-side via YouTube innertube API (ANDROID client, IOS fallback)
  5. Deducts credit minutes atomically (`$inc: -minutesNeeded`)
  6. Returns transcript text + metadata + `minutesCharged` + `creditMinutesRemaining`
- `POST /channel-videos` — Resolve channel URL → uploads playlist → paginated fetch all videos → batch video details
- `POST /save-individual` — Save single transcript to library (no credit deduction — already charged on extract)
- `POST /save-bulk` — Save bulk channel transcripts to library (no credit deduction)
- `GET /usage-history` — Credit usage history

**`/api/transcripts/*`** — `routes/transcriptRoutes.js`
- `GET /individual` — List user's individual transcripts
- `GET /bulk` — List user's bulk transcripts
- `GET /:id` — Get full transcript detail
- `DELETE /:id` — Delete transcript
- `POST /:id/chat` — AI chat about a transcript (OpenAI GPT-4o with truncated transcript as context)
- `GET /:id/chat/history` — Chat history for a video
- `POST /:id/suggestions` — Generate AI question suggestions
- `GET /:id/download` — Download transcript as ZIP/text

### Transcript Fetching — The Innertube Approach

YouTube blocks simple scraping from server IPs. TubeWhiz uses the **innertube player API** — the same internal API YouTube's mobile apps use:

1. **ANDROID client** (primary) — `POST youtube.com/youtubei/v1/player` with Android UA + context
2. **IOS client** (fallback) — Same endpoint, iOS UA + context
3. Response includes `captions.playerCaptionsTracklistRenderer.captionTracks`
4. Fetch timedtext XML from the caption track URL
5. Parse `<p t="" d="">` (milliseconds) or `<text start="" dur="">` (seconds) format
6. Format as `[MM:SS] text` lines

**Proxy rotation** — All innertube calls go through Webshare rotating residential proxies (`undici` ProxyAgent) to avoid IP-based rate limiting. Configured via `PROXY_LIST` env var (comma-separated proxy URLs). Retry logic with backoff (2 retries).

### Models (Mongoose)

**User** (`models/userModel.js`)
```
name, email, picture, googleId
creditMinutes (default: 250)
clickedPurchase (bool, default: false)
wantsToPayUSD (number, default: 0)
timestamps: true
```

**Transcript** (`models/transcriptModel.js`)
```
user_id (ObjectId ref → User, indexed)
channelUrl, channelId (required), channelName (required)
channelProfilePictureUrl
extractionType: 'individual' | 'bulk'
videos: [VideoSubdoc]
stats: { totalVideos, successCount, unavailableCount, totalCreditsCharged }
created_at, timestamps
Index: { user_id: 1, created_at: -1 }
```

**VideoSubdoc** (embedded in Transcript)
```
videoId (required), title (required)
publishedAt, viewCount, duration
transcript, transcriptStatus: 'success' | 'unavailable' | 'error'
truncatedTranscript, cachedSummary
creditsCharged
chatMessages: [{ role, content, created_at }]
```

### Credit System

- Unit: **minutes** — 1 minute of video = 1 credit minute
- Default balance: **250 minutes** per new user
- Charged **on extraction** (not on save) — `POST /fetch-transcript`
- Duration lookup: YouTube Data API `contentDetails.duration` (ISO 8601: `PT1H2M10S`)
- Parsing: `parseDurationToSeconds()` in `utils/creditCalculator.js`
- Fallback: 1 minute if duration unavailable
- Bulk: each video charged individually during extraction loop
- Purchase flow: fake checkout UI records demand (`clickedPurchase`, `wantsToPayUSD`) — no Stripe integration yet

### Deployment

- **Fly.io** — `fly.toml`: app `backend-youtube-app`, region `iad`, shared-cpu-1x, 512MB, auto-stop/start
- **CI/CD** — `.github/workflows/deploy.yml`: on push to `main` → `flyctl deploy --remote-only` using `FLY_API_TOKEN` repo secret

---

## Frontend Web App (`web/`)

### Stack
- Vite 6 + React 18 + React Router 6 + Tailwind CSS
- Google OAuth via `@react-oauth/google`
- ReactMarkdown for AI chat rendering

### Pages

| Route | Component | Purpose |
|-------|-----------|---------|
| `/` (unauthed) | `Landing.jsx` | Marketing landing with dev login |
| `/` (authed) | `Extract.jsx` | URL input → transcript extraction |
| `/library` | `Dashboard.jsx` | Saved transcripts (Videos / Channels tabs) |
| `/transcript/:id` | `TranscriptView.jsx` | Read transcript + AI chat sidebar |
| `/account` | `Account.jsx` | Profile, credit balance, fake checkout |

### Key Flows

**Individual extraction:** URL → `parseYouTubeUrl()` → `POST /fetch-transcript` → show transcript with title/channel/minutes-charged → "Save to Library" → `POST /save-individual` → navigate to `/transcript/:id`

**Bulk extraction:** Channel URL → `POST /channel-videos` → show video list → "Extract All" → loop `POST /fetch-transcript` per video (with progress bar, running minutes counter) → `POST /save-bulk` → "View Transcripts" → `/library?tab=bulk`

**AI chat:** In `TranscriptView.jsx` — suggestions on load, free-text input, messages rendered with ReactMarkdown, chat history persisted per video

### API Client (`utils/api.js`)
- Base URL from `VITE_API_URL` env var (empty in dev → Vite proxy handles it)
- JWT from `localStorage` (`tubewhiz_token`)
- All calls through `request(method, path, body)` helper
- Modules: `auth`, `youtube`, `transcripts`

### Dev Setup
- `vite.config.js` proxies `/api` → `http://localhost:4000`
- Dev server: port 3000 (launch.json uses port 3001 via direct Vite binary)

### Deployment
- **Vercel** — auto-deploy on push to `main`
- Domain: `tubewhiz.win` (A record → `76.76.21.21`)
- **Cloudflare DNS only** (no proxy) — see `DEPLOYMENT-NOTES.md`

---

## Chrome Extension (`extension-new/`)

- Manifest V3 with `sidePanel`, `activeTab`, `identity` permissions
- Content script injects on `youtube.com/*`
- Side panel UI: React + Vite build
- OAuth2 via Chrome identity API (same Google client ID)
- Talks to same backend API (`api.tubewhiz.win`)

---

## DNS & Infrastructure

| Record | Type | Target | Proxy |
|--------|------|--------|-------|
| `tubewhiz.win` | A | `76.76.21.21` (Vercel) | DNS only |
| `www` | CNAME | Vercel | DNS only |
| `api` | A/AAAA | Fly.io | DNS only |

**Why no Cloudflare proxy:** Vercel and Fly.io both have their own global edge networks + managed SSL. Cloudflare proxy adds latency (double edge hop), causes SSL redirect loops, and breaks Vercel edge functions. DNS-only is correct here.

---

## Environment Variables

### Backend (Fly.io secrets)
```
MONGODB_URI          — MongoDB Atlas connection string
JWT_SECRET           — JWT signing secret
YOUTUBE_API_KEY      — YouTube Data API v3 key
OPENAI_API_KEY       — OpenAI API key (GPT-4o for chat)
PROXY_LIST           — Comma-separated Webshare residential proxy URLs
NODE_ENV             — production
```

### Frontend (Vercel env)
```
VITE_API_URL         — https://api.tubewhiz.win
VITE_GOOGLE_CLIENT_ID — Google OAuth client ID
```

### GitHub (repo secrets)
```
FLY_API_TOKEN        — Fly.io deploy token (include full FlyV1 prefix)
```
