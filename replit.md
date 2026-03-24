# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Python FastAPI Backend (DAV Pharmaceutical Records)

A standalone Python FastAPI service at the root level. Logs into dichvucong.dav.gov.vn (ABP Framework), fetches 7 datasets of Vietnamese government pharmaceutical records (TT46/TT47/TT48), stores them in Replit PostgreSQL, and serves stats for the React dashboard.

### Files
- `main.py` — FastAPI app: sync endpoints, stats endpoints, helpers
- `db.py` — SQLAlchemy engine + session + `init_db()` (creates all tables)
- `models.py` — ORM models: `TraCuuChung`, `TT48DaXuLy`, `TT47DaXuLy`, `TT46DaXuLy`, `TT48DangXuLy`, `TT47DangXuLy`, `TT46DangXuLy`, `DaXuLy` (unified)
- `auth_client.py` — Login + XSRF token extraction + remote API calls
- `requirements.txt` — Python dependencies

### Database Tables (unified)
- `tra_cuu_chung` — main lookup table (all 3 thủ tục, thuTucId in JSONB)
- `da_xu_ly` — **unified** đã xử lý, `thu_tuc` integer column (46/47/48) + JSONB data
- `dang_xu_ly` — **unified** đang xử lý, `thu_tuc` integer column (46/47/48) + JSONB data
- `tt48_da_xu_ly`, `tt47_da_xu_ly`, `tt46_da_xu_ly` — legacy (giữ lại, **không ghi mới từ v2 trở đi**)
- `tt48_dang_xu_ly`, `tt47_dang_xu_ly`, `tt46_dang_xu_ly` — legacy (giữ lại, **không ghi mới từ v2 trở đi**)
- `sync_meta` — 1 row/bảng, lưu `synced_at` + `record_count` (thay cho cột `synced_at` per-row cũ)

### Notes on null ngayTraKetQua in da_xu_ly
- TT48: ~1,209 records có `trangThaiHoSo=4` + `pId≠null` → **bình thường**, là hồ sơ trung gian (chưa giải quyết xong)
- TT46/TT47: ~13 records có `trangThaiHoSo=6` (đã giải quyết) nhưng không có `ngayTraKetQua` → **lỗi dữ liệu nguồn** (không phải lỗi code)

### JOIN Key (critical)
`tra_cuu_chung.data->>'hoSoXuLyId_Active'` = `da_xu_ly.data->>'id'` AND `da_xu_ly.thu_tuc = :thu_tuc`

### Required Secrets
- `BASE_URL` — Base URL of dichvucong.dav.gov.vn
- `REMOTE_USERNAME` / `REMOTE_PASSWORD` — Login credentials
- `LOGIN_PATH` — Login path on remote site
- `SESSION_SECRET` — Internal session secret

### Sync Endpoints (POST)
- `/sync/tra-cuu-chung` — Sync tra_cuu_chung (all 3 thủ tục)
- `/sync/tt48-da-xu-ly` → writes `da_xu_ly` (thu_tuc=48) + `tt48_da_xu_ly` (legacy)
- `/sync/tt47-da-xu-ly` → writes `da_xu_ly` (thu_tuc=47) + `tt47_da_xu_ly` (legacy)
- `/sync/tt46-da-xu-ly` → writes `da_xu_ly` (thu_tuc=46) + `tt46_da_xu_ly` (legacy)
- `/sync/tt48-dang-xu-ly`, `/sync/tt47-dang-xu-ly`, `/sync/tt46-dang-xu-ly` — Đang xử lý

### Stats Endpoints (GET)
- `/stats/summary?thu_tuc=&from_date=&to_date=` — 4 metrics: tồn trước / đã nhận / đã giải quyết / tồn sau
- `/stats/giai-quyet?thu_tuc=&from_date=&to_date=` — Đúng hạn / Quá hạn breakdown
- `/stats/ton-sau?thu_tuc=&to_date=` — Còn hạn / Quá hạn breakdown

### Data Cleaning
- `_clean_record(item)` — strips duplicate date strings (e.g. "23/05/2025\n23/05/2025")
- `_clean_date_value(v)` — converts DD/MM/YYYY → ISO 8601, takes first part if duplicated
- Applied automatically during all sync operations

### Workflow
- `FastAPI Python Server` — runs `uvicorn main:app --host 0.0.0.0 --port 8000 --reload`

---

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   └── api-server/         # Express API server
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /health` (full path: `/api/health`)
- Depends on: `@workspace/db`, `@workspace/api-zod`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.cjs`)
- Build bundles an allowlist of deps (express, cors, pg, drizzle-orm, zod, etc.) and externalizes the rest

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/<modelname>.ts` — table definitions with `drizzle-zod` insert schemas (no models definitions exist right now)
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`, and we fallback to `pnpm --filter @workspace/db run push-force`.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec (e.g. `HealthCheckResponse`). Used by `api-server` for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec (e.g. `useHealthCheck`, `healthCheck`).

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.
