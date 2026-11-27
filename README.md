# Shorts Autopilot (Local + 24/7 Cloud Backend)

Hands-free Faceless YouTube Shorts generator & publisher across all **6 styles** (`Tall Tale 3D`, `Deep Dive 3D`, `Night File 3D`, `Inside Out 2D`, `Stick Story 2D`, `Paper Atlas 2D`).

## Key Capabilities
- **Strict Zero-Repeat Story Engine:** Tracks every story key and normalized title/topic fingerprint in `data/db.json` so **no story is ever repeated or recycled**.
  - Priority: **Local Ollama** → **Free Cloud Gemini API (`GEMINI_API_KEY`)** → **Unused 24-Story Verified Bank**.
- **Runs Even When Your Laptop Is OFF (3 Ways):**
  1. **Free GitHub Actions Cloud Cron (`.github/workflows/autopilot.yml`):** Push this folder to GitHub, add 4 secrets (`YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN`, `GEMINI_API_KEY`), and GitHub generates & publishes 1 unique Short every 2 hours 24/7 while your laptop is shut down—committing `data/db.json` after every post so no story ever repeats.
  2. **24/7 Cloud VPS / Docker (`Dockerfile` + `docker-compose.yml`):** Deploy on Oracle Cloud Always-Free, Railway, Render, Fly.io, or any Linux VPS with `docker compose up -d` to keep the full dashboard and 2-hour scheduler running 24/7.
  3. **YouTube Native Scheduled Batch (`publishAt`):** Click **Schedule 6 on YouTube (Every 2h · Works Laptop Off)** in the dashboard—it renders 6 unique Shorts and schedules them on YouTube every 2 hours so YouTube itself releases them even after you shut down your laptop.

## Quick Start (Local)
1. Double-click `start-autopilot.bat` (or run `node src/server.js`).
2. Open `http://127.0.0.1:3456`.
3. Connect YouTube once via OAuth 2.0 (zero per-video approval afterward).
4. Optional: paste a free **Gemini API Key** (from `aistudio.google.com`) or run local **Ollama** (`ollama pull llama3.2`) for unlimited unique stories forever.
5. Click **Start Autopilot** (or click **Copy Cloud .env / GitHub Secrets** to deploy 24/7 to the cloud!).
