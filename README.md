# Agent Grove

### The office where tiny pixel people do your research so you don't have to pretend you "googled it thoroughly."

Welcome to **Agent Grove** — a full-stack pixel office where you play Manager, assign a mission, and watch a crew of specialized AI agents scramble to their desks like it's Monday and the coffee just kicked in.

Built with React + Fastify + OpenRouter.  
Office vibes & characters adapted from [Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents) (MIT). Thank you, tiny legends.

---

## Why does this exist?

Because watching a progress spinner is boring.  
Watching five agents *walk to chairs*, *type furiously*, and *deliver a report to your inbox* is… slightly more honest about how group projects feel.

Also: research → analysis → QA → write-up, but with WASD.

---

## The loop (aka “how work happens here”)

1. **You** — strut around the office with **WASD** (don't worry, typing in forms still works; the keyboard knows the difference between "boss walking" and "boss writing").
2. **Assign work** — drop a research mission on the board.
3. **The crew** gets hired for one job:

| Agent | Job title (on their LinkedIn) | Actually does |
|-------|-------------------------------|---------------|
| **Planner** | Professional Overthinker | Turns your prompt into a plan |
| **Scout** | Professional Googler™ | Gathers findings |
| **Analyst** | Spreadsheet Whisperer | Compares, scores, recommends |
| **Inspector** | Professional Buzzkill | Quality check before you look silly |
| **Scribe** | The One Who Writes The Thing | Final Markdown report |

4. Live **WebSocket** updates keep the office moving (status bubbles, seating, delivery).
5. Finished reports land in **Inbox**. Export to **PDF** when you want to look professional in a meeting you forgot about.

No API key? Fine. **Demo mode** still runs the whole office drama with placeholder reports. The vibes stay intact.

---

## Stack (for humans who ask “is this full-stack?”)

Yes.

| Layer | Tech | Vibes |
|-------|------|--------|
| Web | React + Vite + TypeScript + Canvas | Pixel office, not another dashboard |
| Server | Fastify + WebSocket + OpenRouter | Agents that actually talk to models |
| Data | JSON file store | Simple. Charming. Don't sue us at scale |

Monorepo: `apps/web`, `apps/server`, `packages/shared`.

---

## Local setup (5 minutes, fewer tears)

```bash
cp .env.example .env
# paste OPENROUTER_API_KEY like a responsible adult

npm install
npm run dev
```

- Web → http://localhost:5173  
- API → http://localhost:8787  

```bash
npm run build   # shared + server + web
npm start       # production server (serves the built UI too)
```

**Hot tip:** never commit `.env`. The internet does not need your API key as a souvenir.

---

## Deploy free (recommended: Render)

One Web Service. Frontend + API + WebSockets. One URL. One bill (zero dollars, with a nap timer).

1. Push this repo to GitHub.
2. [render.com](https://render.com) → **New → Web Service** → select this repo.
3. Settings:

| Setting | Value |
|---------|--------|
| Runtime | Node |
| Build | `npm install && npm run build` |
| Start | `npm start` |
| Plan | Free |

4. Env vars worth setting:

| Key | Value |
|-----|--------|
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` |
| `OPENROUTER_API_KEY` | your key |
| `OPENROUTER_MODEL` | `openai/gpt-4o-mini` |
| `OPENROUTER_APP_NAME` | `Agent Grove` |
| `CORS_ORIGIN` | your Render URL |
| `OPENROUTER_SITE_URL` | same Render URL |

Free Render apps sleep when idle. First visit after a nap: ~30–60s of “hello…? anyone home?”

Also fine: **Railway**, **Fly.io**.  
**Vercel alone** is for the frontend cosplay — you still need a Node home for the API.

---

## Controls & etiquette

- **WASD** — Manager stroll  
- **Assign work** — give the office something to panic about  
- **Inbox** — collect finished reports (and PDFs)  
- Be nice to the Inspector. They're just doing their job.

---

## Credits & honesty corner

- Pixel office art/characters from [Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents) (MIT).  
- Models via [OpenRouter](https://openrouter.ai/).  
- Any resemblance to a real workplace is intentional and slightly concerning.

---

## License vibe

Use it. Learn from it. Deploy it for your end-term.  
Just don't commit secrets, and please feed the agents actual API credits if you want real answers instead of demo mode theater.

---

*Agent Grove — where research looks like a game, and the game looks suspiciously like work.*
