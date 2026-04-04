# HANDOFF

This file is the fastest onboarding reference for continuing work on this repository in a new Codex/ChatGPT session or account.

Read this file together with [`README.md`](/D:/DVC-QLCL/README.md) before making changes.

## 1. Project summary

`DVC-QLCL` is an internal DAV dossier reporting system with three runtime layers:

- Python FastAPI backend
  - logs into `dichvucong.dav.gov.vn`
  - fetches raw dossier/workflow data
  - writes to PostgreSQL
  - exposes internal admin endpoints
  - handles DAV-integrated actions such as TT48 dossier detail and attachment fetch
- Node/Express API server
  - serves dashboard-facing `/api/*`
  - enforces auth/role access
  - exposes stats, lookup, exports, and admin relay endpoints
- React/Vite dashboard
  - statistics tabs for TT48/TT47/TT46
  - processing tabs
  - lookup tab
  - admin panel

Main data domain:

- `Tra_cuu_chung`: dossier master/reference data
- `Dang_xu_ly`: dossiers currently in workflow
- `Da_xu_ly`: completed dossiers

Primary procedures in scope:

- TT48
- TT47
- TT46

## 2. Runtime architecture

### Python backend

Entrypoint:

- [`D:\DVC-QLCL\main.py`](/D:/DVC-QLCL/main.py)

Key modules:

- [`D:\DVC-QLCL\sync_service.py`](/D:/DVC-QLCL/sync_service.py)
- [`D:\DVC-QLCL\auth_client.py`](/D:/DVC-QLCL/auth_client.py)
- [`D:\DVC-QLCL\migration_service.py`](/D:/DVC-QLCL/migration_service.py)
- [`D:\DVC-QLCL\stats_views.py`](/D:/DVC-QLCL/stats_views.py)
- [`D:\DVC-QLCL\internal_routes.py`](/D:/DVC-QLCL/internal_routes.py)
- [`D:\DVC-QLCL\public_routes.py`](/D:/DVC-QLCL/public_routes.py)
- [`D:\DVC-QLCL\scheduler_service.py`](/D:/DVC-QLCL/scheduler_service.py)

Important behavior:

- startup now runs only lightweight schema migration
- heavy stats migration was moved out of startup
- scheduled sync does not run immediately at startup anymore
- `sync/all` now logs phase timings and defers MV refresh to one final pass

### API server

Entrypoint:

- [`D:\DVC-QLCL\artifacts\api-server\src\index.ts`](/D:/DVC-QLCL/artifacts/api-server/src/index.ts)

Important routes/files:

- [`D:\DVC-QLCL\artifacts\api-server\src\routes\stats.ts`](/D:/DVC-QLCL/artifacts/api-server/src/routes/stats.ts)
- [`D:\DVC-QLCL\artifacts\api-server\src\routes\admin.ts`](/D:/DVC-QLCL/artifacts/api-server/src/routes/admin.ts)
- [`D:\DVC-QLCL\artifacts\api-server\src\routes\auth.ts`](/D:/DVC-QLCL/artifacts/api-server/src/routes/auth.ts)
- [`D:\DVC-QLCL\artifacts\api-server\src\lib\auth.ts`](/D:/DVC-QLCL/artifacts/api-server/src/lib/auth.ts)

Important behavior:

- role-based dashboard auth is enforced here
- `viewer` can access stats only
- `admin` can access lookup, DAV detail/file routes, and admin routes
- Admin routes still also require `ADMIN_EXPORT_TOKEN`

### Dashboard

Main UI file:

- [`D:\DVC-QLCL\artifacts\dashboard\src\App.tsx`](/D:/DVC-QLCL/artifacts/dashboard/src/App.tsx)

Important behavior:

- single large app file
- login screen before dashboard
- role-based tab visibility
- admin button only for `admin`
- lookup tab is hidden for `viewer`

## 3. Production services

### Python service

Service name:

- `dvc-qlcl-python.service`

Config:

```ini
[Unit]
Description=DVC-QLCL Python FastAPI
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=hahoangphuong
WorkingDirectory=/home/hahoangphuong/DVC-QLCL
EnvironmentFile=/home/hahoangphuong/DVC-QLCL/.env
Environment=PYTHONUNBUFFERED=1
ExecStart=/home/hahoangphuong/DVC-QLCL/venv/bin/python3 -m uvicorn --app-dir /home/hahoangphuong/DVC-QLCL main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=dvc-qlcl-python

[Install]
WantedBy=multi-user.target
```

### API service

Service name:

- `dvc-qlcl-api.service`

Config:

```ini
[Unit]
Description=DVC-QLCL Node API
After=network.target

[Service]
Type=simple
User=hahoangphuong
WorkingDirectory=/home/hahoangphuong/DVC-QLCL
EnvironmentFile=/home/hahoangphuong/DVC-QLCL/.env
Environment=NODE_ENV=production
Environment=PORT=8080
Environment=PYTHON_INTERNAL_URL=http://127.0.0.1:8000
ExecStart=/bin/bash -lc 'source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && node /home/hahoangphuong/DVC-QLCL/artifacts/api-server/dist/index.cjs'
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=dvc-qlcl-api

[Install]
WantedBy=multi-user.target
```

Note:

- current TypeScript code uses `PYTHON_API_BASE_URL`
- service currently sets `PYTHON_INTERNAL_URL`
- if relays to Python fail after API changes, check this first

### Nginx

File:

- `/etc/nginx/sites-available/dvc-qlcl`

Config:

```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;

    server_name _;

    location = / {
        return 302 /dashboard/;
    }

    location /dashboard/ {
        alias /home/hahoangphuong/DVC-QLCL/artifacts/dashboard/dist/public/;
        index index.html;
        try_files $uri $uri/ /dashboard/index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 4. Environment variables

### Core

- `DATABASE_URL`
- `BASE_URL`
- `LOGIN_PATH`
- `REMOTE_USERNAME`
- `REMOTE_PASSWORD`
- `ADMIN_EXPORT_TOKEN`

### Python/API bridge

- `PYTHON_API_BASE_URL`
  - expected by current API server code
  - should normally be `http://127.0.0.1:8000`

### Dashboard auth

- `DASHBOARD_VIEWER_PASSWORD`
- `DASHBOARD_ADMIN_PASSWORD`
- `DASHBOARD_SESSION_SECRET`
- `DASHBOARD_COOKIE_SECURE`
  - `false` for HTTP deployments
  - `true` only if the dashboard is actually served through HTTPS

## 5. Common deploy workflow

Typical production update:

```bash
cd /home/hahoangphuong/DVC-QLCL
git pull
```

### Rebuild API server

```bash
cd /home/hahoangphuong/DVC-QLCL/artifacts/api-server
pnpm install
pnpm build
sudo systemctl restart dvc-qlcl-api
sudo systemctl status dvc-qlcl-api
```

### Rebuild dashboard

```bash
cd /home/hahoangphuong/DVC-QLCL/artifacts/dashboard
pnpm install
pnpm build
```

Then reload nginx if needed:

```bash
sudo systemctl reload nginx
```

### Restart Python backend

```bash
sudo systemctl restart dvc-qlcl-python
sudo systemctl status dvc-qlcl-python
```

## 6. Stats migration workflow

Heavy stats migration is no longer executed automatically at Python startup.

Use it only when deploying changes that alter:

- materialized view SQL
- stats indexes
- stats schema shape
- columns required by stats queries

How to run:

- Admin panel button: `Stats Migration`
- or:

```bash
curl -X POST http://127.0.0.1:8000/internal/migrate/stats
```

Important:

- do not run this after every `sync/all`
- only run when stats schema changed

## 7. Sync behavior and performance notes

Important recent changes:

- sync log now separates:
  - raw fetch time
  - processing time
  - DB write time
  - final MV refresh time
- `sync/all` refreshes stats MVs once at the end, not after every dataset
- dashboard API uses caching and stale-while-revalidate to reduce lockups during sync
- Python startup was previously very slow because heavy stats migration ran during startup; this was moved out

Known operational reality:

- Python startup can still take noticeable time on heavy DB work, but should now be much faster than before
- if dashboard becomes sluggish during scheduled sync, first inspect:
  - sync logs
  - final MV refresh duration
  - DB contention

## 8. TT48 workflow logic

This is the functional workflow currently assumed in code and UI reasoning.

1. Hồ sơ được tiếp nhận.
2. Hồ sơ được chuyển lên Trưởng phòng.
3. Trưởng phòng phân công hồ sơ cho chuyên viên thụ lý.
4. Chuyên viên thẩm định hồ sơ.
5. Chuyên viên chuyển hồ sơ cho chuyên gia.
6. Chuyên gia thẩm định xong chuyển lại cho chuyên viên.
7. Chuyên viên tổng hợp hồ sơ và trình Tổ trưởng.
8. Tổ trưởng thẩm định và chuyển Trưởng phòng.
9. Trưởng phòng xét duyệt:
   - nếu hồ sơ cần bổ sung:
     - ký công văn
     - chuyển Văn thư ban hành
   - nếu hồ sơ đạt:
     - chuyển lại chuyên viên để kết thúc hồ sơ
   - nếu không đồng ý:
     - trả lại chuyên viên để thẩm định lại
10. Khi bị trả lại, chu trình lại quay về:
    - chuyên viên thẩm định
    - chuyển chuyên gia
    - tổng hợp
    - trình Tổ trưởng
    - trình Trưởng phòng

Implication for dashboard logic:

- TT48 statuses are not purely linear
- hồ sơ có thể quay vòng nhiều lần giữa chuyên viên, chuyên gia, tổ trưởng, trưởng phòng
- expert and specialist statistics should be interpreted carefully against this loop

## 9. Auth notes

Current dashboard access model:

- `viewer`
  - can access statistics tabs
  - cannot access lookup
  - cannot access admin panel
- `admin`
  - can access everything

Implementation details:

- auth session is a signed cookie handled by the API server
- admin routes additionally require `ADMIN_EXPORT_TOKEN`
- if login appears successful but admin/lookup calls fail with “Chưa đăng nhập dashboard”, check:
  - `DASHBOARD_COOKIE_SECURE`
  - browser hard refresh
  - whether the cookie was actually set

## 10. High-risk files

Files that tend to have broad impact:

- [`D:\DVC-QLCL\sync_service.py`](/D:/DVC-QLCL/sync_service.py)
- [`D:\DVC-QLCL\migration_service.py`](/D:/DVC-QLCL/migration_service.py)
- [`D:\DVC-QLCL\stats_views.py`](/D:/DVC-QLCL/stats_views.py)
- [`D:\DVC-QLCL\artifacts\api-server\src\lib\stats\workflow.ts`](/D:/DVC-QLCL/artifacts/api-server/src/lib/stats/workflow.ts)
- [`D:\DVC-QLCL\artifacts\api-server\src\lib\stats\overview.ts`](/D:/DVC-QLCL/artifacts/api-server/src/lib/stats/overview.ts)
- [`D:\DVC-QLCL\artifacts\dashboard\src\App.tsx`](/D:/DVC-QLCL/artifacts/dashboard/src/App.tsx)

Guideline:

- read carefully before touching
- avoid mixing unrelated fixes in these files

## 11. Recommended startup prompt for a new Codex session

Use something like this in a fresh account/session:

```text
Read README.md and HANDOFF.md first. Then summarize:
1. architecture
2. deploy/runbook
3. important env vars
4. recent operational gotchas
Do not change code until after that summary.
```

If resuming a specific task:

```text
Current repo is DVC-QLCL. Read README.md and HANDOFF.md first, then inspect the latest commits and continue from there.
```

## 12. What to update in this file

Whenever major behavior changes, update this file with:

- new env vars
- changed service names or ports
- new deploy steps
- new admin actions
- changed TT48 workflow assumptions
- major performance or migration changes
