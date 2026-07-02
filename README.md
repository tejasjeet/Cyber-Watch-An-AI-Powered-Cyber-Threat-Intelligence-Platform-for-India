# Cyber Watch: An AI-Powered Cyber Threat Intelligence Platform for INDIA

A full-stack cyber threat intelligence and reporting platform focused on **India** — combining live ransomware victim data, interactive dashboards, geospatial mapping, AI-driven analysis, phishing URL scanning, and an AI-assisted cyber crime complaint workflow.

## Features

- **Dashboard & KPIs** — India-focused ransomware victim statistics and year-over-year trends
- **Live Feed** — Streaming intel updates with AI analytics (Groq)
- **Map View** — Geospatial visualization of attacks across Indian states
- **Victims & Groups** — Searchable victim hub with AI executive summaries (Google Gemini)
- **Breach & Deployment Analysis** — Structured intel briefings and export
- **Phishing Scanner** — URL safety checks via Google Safe Browsing
- **Cyber Crime Reporting** — Guided AI chat, evidence upload, and complaint report generation
- **Python Scraper** — Syncs India victim data from ransomware.live into MongoDB

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite, Leaflet, Recharts, Framer Motion |
| Backend | Node.js, Express, Socket.io, JWT auth |
| Database | MongoDB (Atlas or local via Docker) |
| Scraper | Python 3, BeautifulSoup |
| AI | Google Gemini, Groq |

## Project Structure

```
├── client/          React frontend (Vite) — http://localhost:5173
├── server/          Node.js API — http://localhost:4000
├── scraper/         Python India victim scraper
├── docker-compose.yml   Local MongoDB (optional)
├── .env.example     Environment variable reference
└── server/.env.example
```

## Prerequisites

- Node.js 18+
- Python 3.10+
- MongoDB Atlas URI **or** Docker for local MongoDB
- API keys (optional but recommended): Google AI, Groq, Google Safe Browsing

## Quick Start

### 1. Clone & install

```bash
git clone https://github.com/YOUR_USERNAME/cyber-watch-india.git
cd cyber-watch-india

cd client && npm install && cd ..
cd server && npm install && cd ..
pip install -r scraper/requirements.txt
```

### 2. Environment

```bash
copy server\.env.example server\.env
```

Edit `server/.env` with your MongoDB URI and API keys. See `.env.example` for all options.

### 3. Database (choose one)

**Local MongoDB:**

```bash
docker compose up -d
```

**MongoDB Atlas:** Set `MONGODB_URI` in `server/.env`.

### 4. Populate data

```bash
python scraper/scrape_india.py
```

### 5. Run

```bash
# Terminal 1 — API
cd server && npm run dev

# Terminal 2 — Frontend
cd client && npm run dev
```

Open **http://localhost:5173**

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `MONGODB_URI` | MongoDB connection string |
| `MONGODB_DB` | Database name (default: `ransomware_india`) |
| `JWT_SECRET` | Session signing secret |
| `GOOGLE_AI_API_KEY` | Victim hub AI analysis (Gemini) |
| `GROQ_API_KEY` | Live feed streaming analytics |
| `GOOGLE_SAFE_BROWSING_API_KEY` | Phishing URL scanner |

Never commit `server/.env` — it is gitignored.

## Scripts

| Command | Location | Description |
|---------|----------|-------------|
| `npm run dev` | `client/` | Vite dev server |
| `npm run build` | `client/` | Production build |
| `npm run dev` | `server/` | API with file watch |
| `npm start` | `server/` | Production API |
| `npm run db:reset` | `server/` | Wipe DB (requires confirm env) |
| `python scrape_india.py` | `scraper/` | Scrape & sync victim data |

## Security Notes

- Rotate any API keys that were ever exposed locally before pushing to a public repo.
- Use strong `JWT_SECRET` in production.
- Restrict MongoDB Atlas network access to trusted IPs in production.

## License

MIT — see repository license file if added.

## Disclaimer

Victim data is sourced from public ransomware tracking sites for **research and awareness**. Use responsibly and in compliance with applicable laws.
