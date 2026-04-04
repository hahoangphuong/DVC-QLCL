# DVC-QLCL Dashboard

Internal dashboard and data sync system for DAV PQLCL dossier monitoring.  
The project pulls dossier data from `dichvucong.dav.gov.vn`, stores it in PostgreSQL, computes reporting aggregates, and exposes:

- a Python backend for DAV integration, sync jobs, and internal admin endpoints
- a Node/Express API for dashboard data, exports, and access control
- a React dashboard for statistics, processing views, dossier lookup, and admin operations

## Why this project exists

The DAV service exposes operational dossier data, but it is not optimized for internal reporting across TT48, TT47, and TT46. This repository provides:

- repeatable synchronization from DAV into a local database
- fast operational dashboards and lookup screens
- admin tooling for sync, logs, exports, scheduler control, and stats migration
- a safer developer workflow for evolving reporting logic without querying upstream systems directly

## Key features

- Synchronizes dossier data from DAV into PostgreSQL
- Tracks TT48, TT47, and TT46 workflows
- Computes materialized statistical views for fast dashboards
- Provides summary, monthly, specialist, expert, and inflight metrics
- Includes dossier lookup with filtering, sorting, Excel export, and TT48 detail modal
- Supports role-based access:
  - `viewer`: statistics only
  - `admin`: statistics + lookup + admin panel
- Exposes internal admin actions for sync, scheduler, logs, and stats migration

## Tech stack

- Python 3.10+ with FastAPI, SQLAlchemy, APScheduler, Requests, BeautifulSoup
- Node.js 20+ with Express and ExcelJS
- React + Vite + TypeScript + TanStack Query + Recharts
- PostgreSQL
- pnpm workspace monorepo

## Quick start

This is the fastest path to a local/dev run.

### Prerequisites

- Node.js 20+
- pnpm 10+
- Python 3.10+
- PostgreSQL 14+

### 1. Clone and install workspace dependencies

```bash
git clone <your-fork-or-repo-url>
cd DVC-QLCL
pnpm install
```

### 2. Create a Python virtual environment

```bash
python -m venv .venv
```

Windows:

```bash
.venv\Scripts\activate
pip install -r requirements.txt
```

Linux/macOS:

```bash
source .venv/bin/activate
pip install -r requirements.txt
```

### 3. Create a `.env` file

At minimum:

```env
DATABASE_URL=postgresql://user:password@localhost/heliumdb

BASE_URL=https://dichvucong.dav.gov.vn
LOGIN_PATH=Account/Login
REMOTE_USERNAME=your-dav-username
REMOTE_PASSWORD=your-dav-password

PYTHON_API_BASE_URL=http://localhost:8000
ADMIN_EXPORT_TOKEN=change-me

DASHBOARD_VIEWER_PASSWORD=viewer-pass
DASHBOARD_ADMIN_PASSWORD=admin-pass
DASHBOARD_SESSION_SECRET=replace-with-a-long-random-string
DASHBOARD_COOKIE_SECURE=false
```

### 4. Start the Python backend

```bash
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

### 5. Start the API server

In a second terminal:

```bash
cd artifacts/api-server
PORT=8080 PYTHON_API_BASE_URL=http://localhost:8000 pnpm dev
```

Windows PowerShell:

```powershell
cd artifacts/api-server
$env:PORT="8080"
$env:PYTHON_API_BASE_URL="http://localhost:8000"
pnpm dev
```

### 6. Start the dashboard

In a third terminal:

```bash
cd artifacts/dashboard
PORT=3000 pnpm dev
```

Windows PowerShell:

```powershell
cd artifacts/dashboard
$env:PORT="3000"
pnpm dev
```

### 7. Open the app

- Dashboard: [http://localhost:3000/dashboard/](http://localhost:3000/dashboard/)
- Login with either:
  - `DASHBOARD_VIEWER_PASSWORD`
  - `DASHBOARD_ADMIN_PASSWORD`

## Usage

### Test connectivity

Python backend:

```bash
curl http://127.0.0.1:8000/
curl http://127.0.0.1:8000/test-login
```

API server:

```bash
curl http://127.0.0.1:8080/api/auth/me
curl "http://127.0.0.1:8080/api/stats/summary?thu_tuc=48&from_date=2026-01-01&to_date=2026-03-31"
```

### Trigger a full sync

Public Python endpoint:

```bash
curl -X POST http://127.0.0.1:8000/sync/all
```

Admin async endpoint through the dashboard API:

```bash
curl -X POST http://127.0.0.1:8080/api/admin/force-sync -H "x-admin-token: YOUR_ADMIN_EXPORT_TOKEN"
```

### Run stats migration after deploying stats-schema changes

Python internal endpoint:

```bash
curl -X POST http://127.0.0.1:8000/internal/migrate/stats
```

Or use the **Stats Migration** button in the Admin panel.

### Build production assets

From the repo root:

```bash
pnpm build
```

This will:

- typecheck the workspace
- build the Express API bundle
- build the Vite dashboard bundle

## Project structure

```text
.
├─ main.py                         # Python FastAPI entrypoint
├─ sync_service.py                 # DAV fetch, processing, sync jobs, TT48 detail/file proxy
├─ migration_service.py            # schema migration + heavy stats migration
├─ internal_routes.py              # internal/admin Python routes
├─ public_routes.py                # public Python sync/test endpoints
├─ auth_client.py                  # DAV login/session client
├─ stats_views.py                  # materialized view refresh helpers
├─ scheduler_service.py            # APScheduler startup logic
├─ db.py                           # SQLAlchemy engine/session setup
├─ artifacts/
│  ├─ api-server/                  # Express API for dashboard consumers
│  │  ├─ src/app.ts
│  │  ├─ src/routes/               # auth, stats, admin routes
│  │  └─ src/lib/                  # auth/session, db, stats helpers
│  ├─ dashboard/                   # React/Vite UI
│  │  └─ src/App.tsx               # main dashboard UI
│  └─ mockup-sandbox/              # isolated frontend sandbox artifact
├─ lib/
│  ├─ db/                          # shared DB package
│  ├─ api-spec/                    # OpenAPI spec
│  ├─ api-zod/                     # generated schemas
│  └─ api-client-react/            # generated React API client helpers
└─ scripts/                        # workspace scripts/utilities
```

## Environment variables

### Python backend

- `DATABASE_URL`: PostgreSQL connection string
- `BASE_URL`: DAV base URL, for example `https://dichvucong.dav.gov.vn`
- `LOGIN_PATH`: DAV login path, usually `Account/Login`
- `REMOTE_USERNAME`: DAV username
- `REMOTE_PASSWORD`: DAV password
- `DATA_URL`: optional legacy remote data URL used by the DAV client
- `PORT`: Python backend port when running `main.py` directly
- `ADMIN_EXPORT_TOKEN`: token used by admin export/sync actions

### API server

- `PORT`: Express port, commonly `8080`
- `DATABASE_URL`: PostgreSQL connection string
- `PYTHON_API_BASE_URL`: Python backend URL, usually `http://localhost:8000`
- `ADMIN_EXPORT_TOKEN`: shared admin token for admin actions
- `DASHBOARD_VIEWER_PASSWORD`: viewer login password
- `DASHBOARD_ADMIN_PASSWORD`: admin login password
- `DASHBOARD_SESSION_SECRET`: secret used to sign dashboard session cookies
- `DASHBOARD_COOKIE_SECURE`: `true` for HTTPS deployments, `false` for local HTTP

### Dashboard

- `PORT`: Vite dev/preview port, commonly `3000`
- `BASE_PATH`: optional base path, defaults to `/dashboard/`

## Development notes

- The Python service performs lightweight schema migration at startup.
- Heavy stats migration has been moved out of startup and should be triggered only when stats schema changes.
- `sync/all` defers materialized view refresh to the end of the run to reduce repeated refresh cost.
- The dashboard relies on the API server for auth and all `/api/*` access.

## Contributing

1. Create a feature branch from `master`
2. Keep backend, stats, and UI changes scoped and intentional
3. Update migration logic when changing serving views or indexes
4. If you change dashboard/API contracts, update this README and relevant code comments
5. Run typechecks/builds where available before opening a PR

Recommended checks:

```bash
pnpm typecheck
pnpm build
```

Python syntax sanity:

```bash
python -m py_compile main.py sync_service.py migration_service.py
```

## License

MIT
