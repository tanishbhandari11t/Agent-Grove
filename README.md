# Agent Grove

A pixel-office AI workspace: assign research missions, watch specialized agents work in a live office, and save reports in Inbox (with PDF export).

Built with React + Fastify + OpenRouter. Office art/characters adapted from [Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents) (MIT).

## What it does

1. Open the office and move the **Manager** with WASD.
2. Assign a research mission.
3. Agents run through OpenRouter: Planner → Scout → Analyst → Inspector → Scribe.
4. Live WebSocket updates animate agent state.
5. Finished reports land in **Inbox** (export as PDF).

## Local setup

```bash
cp .env.example .env
# add your OPENROUTER_API_KEY

npm install
npm run dev
```

- Web: http://localhost:5173  
- API: http://localhost:8787  

Without an API key, the app runs in **demo mode**.

## Agents

| Agent     | Role                         |
|-----------|------------------------------|
| Planner   | Task plan                    |
| Scout     | Research findings            |
| Analyst   | Comparison + recommendation  |
| Inspector | Quality check                |
| Scribe    | Final Markdown report        |

## Stack

- **Web** — React + Vite + TypeScript + Canvas office  
- **Server** — Fastify + WebSocket + OpenRouter  
- **Data** — JSON file store on the server  

## Deploy free (recommended: Render)

Easiest free option for this project: **one Render Web Service** (frontend + API + WebSocket together).

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit: Agent Grove full-stack office"
git branch -M main
git remote add origin https://github.com/tanishbhandari11t/Agent-Grove.git
git push -u origin main
```

### 2. Create a Render Web Service

1. Go to [https://render.com](https://render.com) → sign up with GitHub  
2. **New → Web Service** → select `Agent-Grove`  
3. Settings:

| Setting        | Value |
|----------------|-------|
| Runtime        | Node |
| Build Command  | `npm install && npm run build` |
| Start Command  | `npm start` |
| Instance       | Free |

4. Environment variables:

| Key | Value |
|-----|--------|
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` |
| `OPENROUTER_API_KEY` | your key |
| `OPENROUTER_MODEL` | `openai/gpt-4o-mini` |
| `OPENROUTER_SITE_URL` | your Render URL (after first deploy) |
| `OPENROUTER_APP_NAME` | `Agent Grove` |
| `CORS_ORIGIN` | your Render URL (same origin is fine) |

5. Deploy → open the Render URL.

> Free Render services sleep after idle time; the first request can take ~30–60s to wake.

### Other free options

| Host | Use for | Notes |
|------|---------|--------|
| **Render** | Full app (best fit) | WebSockets OK on free web service |
| **Railway** | Full app | Free credits; easy Node deploy |
| **Fly.io** | Full app | Free allowance; Docker/Node |
| **Vercel** | Frontend only | Pair with Render API if split |

Do **not** put `OPENROUTER_API_KEY` in the frontend or commit `.env`.

## Scripts

```bash
npm run dev      # local web + API
npm run build    # build shared + server + web
npm start        # run production server (serves web dist too)
```
