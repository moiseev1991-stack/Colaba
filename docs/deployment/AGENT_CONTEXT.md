# AGENT_CONTEXT.md — Project Memory (Colaba / SpinLid)

## 1) Project Overview
- Project: Colaba (SpinLid)
- Frontend: Next.js 14 (App Router)
- Backend: FastAPI
- DB: PostgreSQL
- Cache/Queue: Redis + Celery
- Deploy: Coolify on VPS
- Server IP: 88.210.53.183
- Domains: sslip.io (frontend/backend)

## 2) Current Production Issues (Active)
### Infra / Deploy
- 504 Gateway Timeout via domains (Coolify proxy / Nginx path issue)
- Sometimes frontend domain returns simple 404 instead of app
- Possible cause: two Coolify apps exist for same project and conflict
- Proxy network isolation issue (coolify-proxy not always connected to correct app network)

### Frontend / Runtime
- Hydration errors in production:
  - React #418
  - React #423
  - HierarchyRequestError
  - NotFoundError
- Symptom: content flashes, then disappears (white screen)

### Local Dev
- `npm run dev` may fail on port 4000 (`EADDRINUSE`)

## 3) What Was Already Done
- Simplified layout (removed `dynamic/ssr:false`, left `ClientRoot`)
- Added script: `fix-coolify-404.sh` (connect coolify-proxy to app network)
- Created docs:
  - `docs/deployment/SERVER_QUICK_FIXES.md`
  - `docs/deployment/PROXY_NETWORK_ISOLATION.md`

## 4) Known Environment / Infra Facts
- Two Coolify apps exist:
  - `okkkosgk8ckk00g8goc8g4sk`
  - `w0wok0gck048wwk0k8k4ck4s`
- This can cause domain/proxy conflicts
- On server, health checks pass:
  - `curl http://127.0.0.1:3000/` -> 200
  - `curl http://127.0.0.1:8001/health` -> healthy

## 5) Critical Paths (important files)
- `frontend/app/layout.tsx`
- `frontend/components/ClientRoot.tsx`
- `docker-compose.prod.yml`
- `scripts/deployment/`
- `docs/deployment/`

## 6) Working Rules for Any AI Agent (MANDATORY)
Before making any changes:
1. Read this file: `deployment/AGENT_CONTEXT.md`
2. Read recent history: `deployment/WORKLOG.md`
3. Identify if task affects:
   - frontend hydration
   - docker/coolify networking
   - nginx/proxy routing
4. Do NOT rewrite unrelated files
5. Prefer minimal, isolated fixes
6. After changes, update `deployment/WORKLOG.md`

## 7) Constraints / Do-Not-Break
- Do not introduce SSR/client mismatch in Next.js app router
- Do not add browser-only APIs in server render path
- Do not create duplicate proxy layers unless necessary
- Do not keep two active Coolify apps with same domains
- Keep deployment docs synchronized with actual changes

## 8) Frontend Hydration Safety Checklist
When editing frontend:
- No `window/document/localStorage` in SSR render path
- No `Date.now()` / `Math.random()` in render output
- No DOM mutation before hydration
- Portals only with stable portal container
- `layout.tsx` contains only one `<html>` and `<body>`
- Client-only behavior moves to `useEffect`

## 9) Coolify / Proxy Checklist
When editing deploy infra:
- Verify only one active Coolify app uses production domains
- Verify `coolify-proxy` is attached to the correct docker network
- If internal Nginx exists, confirm upstream service names are correct
- Confirm frontend and backend ports are exposed correctly
- Re-check domain routing after redeploy

## 10) How to Report Completion (required)
After each task, agent must write to `deployment/WORKLOG.md`:
- Date/time
- Task summary
- Files changed
- What exactly changed
- Result
- Next recommended step
