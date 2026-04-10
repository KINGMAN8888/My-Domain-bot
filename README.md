# DomainRadar AI 🚀

> AI-powered domain discovery & scoring platform with Telegram bot integration and a modern React dashboard.

---

## Features

- 🔍 **Automated Domain Scanning** — Hourly worker scans expiring domains
- 🧠 **AI Scoring Algorithm** — Scores domains 0–100 based on TLD, length, golden keywords
- 📊 **React Dashboard** — Real-time stats, sortable table, save/filter domains
- 🤖 **Telegram Bot** — Interactive commands + instant golden domain alerts
- ⚡ **FastAPI Backend** — RESTful API with Swagger docs
- 🐳 **Docker Ready** — One-command production deployment

---

## Quick Start

### 1. Clone & Configure
```bash
git clone https://github.com/your-username/My-Domain-bot.git
cd My-Domain-bot
cp .env.example .env
# Edit .env with your TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID
```

### 2. Backend
```bash
pip install -r requirements.txt
python backend.py both        # API + Worker + Telegram Bot
# python backend.py api       # API only
# python backend.py worker    # Worker only
# python backend.py bot       # Bot only
```

### 3. Frontend
```bash
npm install
npm run dev                   # Dev server → http://localhost:3000
npm run build                 # Production build → dist/
```

---

## Docker Deployment
```bash
docker compose up -d
# Backend  → http://localhost:8000
# Frontend → http://localhost:3000
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Health ping |
| GET | `/api/health` | Full health status + uptime |
| GET | `/api/domains` | List domains (params: `limit`, `search`) |
| GET | `/api/domains/{domain}` | Domain detail |
| DELETE | `/api/domains/{domain}` | Remove domain |
| GET | `/api/stats` | Statistics |
| POST | `/api/scan` | Trigger scan (param: `demo=true`) |
| POST | `/api/telegram/test` | Send test message |
| GET | `/api/bot/status` | Bot connection status |

📖 **Swagger UI**: `http://localhost:8000/docs`

---

## Telegram Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message & menu |
| `/scan` | Run a scan cycle now |
| `/list` | Last 10 discovered domains |
| `/top` | Top 5 highest-scored domains |
| `/stats` | Database statistics |
| `/settings` | Current config + uptime |
| `/check domain.com` | Check a specific domain |
| `/delete domain.com` | Remove domain from DB |
| `/help` | Full help & score guide |

---

## Scoring System

| Factor | Points |
|--------|--------|
| `.com` TLD | +25 |
| `.ai` TLD | +20 |
| `.io` TLD | +15 |
| `.net` TLD | +10 |
| Length ≤4 chars | +25 |
| Length ≤7 chars | +15 |
| Golden keyword match | +10 each |
| Contains dash `-` | −30 |
| Contains digit | −20 |

**Golden keywords**: `ai, tech, crypto, pay, app, hub, web, data, cloud, nexus`

---

## Environment Variables

See [`.env.example`](.env.example) for full reference.

---

## Production Deploy (Railway / Render)

1. Push to GitHub
2. Connect repo to Railway/Render
3. Set environment variables from `.env.example`
4. Deploy — `Procfile` handles the rest

---

## Tech Stack

- **Backend**: Python 3.12, FastAPI, SQLite, Uvicorn
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4
- **Bot**: python-telegram-bot (polling)
- **Deploy**: Docker Compose, Procfile
