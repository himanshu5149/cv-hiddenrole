# HiddenRole
Upload a CV (PDF, DOCX, text) and discover roles, jobs, scholarships and programs you overlooked, with CV evidence for every match, honest gaps and a next action. **No AI API, no paid service, no API keys.** Everything runs on your own server with SQLite.

## Run
    npm install
    npm test        # 42 tests
    npm start       # http://localhost:3000
Docker: `docker compose up --build` (data persists in a volume).

## How matching works
- Education: degrees are matched by name (bachelor/BCA/B.Sc/master/MBA/PhD…), "Scrum Master" or "be in" are not degrees, and a degree still being pursued is "in progress", not completed.
- Experience years come from job date ranges (merged when they overlap, "Present" counted) plus stated years; degree dates are never counted as work. Unknown years are a warning, never a fail.
- Skills are found with a keyword dictionary (`src/engine.js`); each match keeps the CV line as evidence.
- Hard requirements (degree, years, eligible countries) override skill match: a failure is always "Not eligible yet". Missing info is a warning, never a pass.
- "Skill evidence %" is not "% qualified". Programs older than 30 days since last check show as unverified; closed/past-deadline items are hidden.

## Opportunity data (all key-less)
- `src/data/programs.json`: curated scholarships/programs. **Requirements are simplified and `last_checked` is empty: verify each on its official site, then edit.**
- Live jobs load **on demand** (every 6h at most) from free, key-less feeds listed in `companies.json` (Greenhouse board tokens, Lever company names, `"remotive": true`). On Vercel this is automatic; locally set `INGEST_ON_DEMAND=1`. A failed feed never breaks analysis. Each job shows its location, and non-worldwide jobs get a ⚠️ check. Also: `npm run ingest`, `INGEST_ENABLED=1` (background, every 6h), or POST `/api/admin/ingest` as admin.
- Your own opportunities: `npm run import my-list.json` (validated: https link, known skill ids). Jobs that vanish from a feed are closed. Respect each source's terms (Remotive: link back and credit, shown as the source).
- Job requirements are extracted from descriptions by keyword/regex: treat as hints.

## Career coach (no AI key)
Rule-based tools that follow the "AI as career strategist" workflow. They measure, flag and ask; they never write claims you did not make. `POST /api/coach` (CV text or file + optional job description + optional answers).
- **Recruiter test:** three separate scores: CV quality (structure, evidence, clarity, achievements), job match (skills and terms from the job found in your CV, with a low-confidence flag when the job text is thin), and eligibility (years, degree, required licences/credentials). Shows the sections it found, what stands out, what causes hesitation and the highest-impact changes. A rule-based estimate, not a real recruiter.
- **Find what I forgot:** bullets with no number or outcome become one-at-a-time questions. Your answers are kept verbatim.
- **Job keywords:** top job terms with CV evidence (✅) or "no evidence" (⚠️); years and degree compared honestly.
- **Best stories:** your 5 strongest lines for the job, plus lines worth cutting.
- **AI-sounding:** ~30 buzzwords and AI-isms found, each with a plain alternative.
- **Context pack:** `verified-experience.md` (CV lines verbatim + your answers) and `writing-style.md` (measured from your CV). Keep both in a Claude/ChatGPT project so every chat starts from verified facts and your style.
- **Prompts:** 7 strategist prompts plus a second-AI fact-check prompt, pre-filled with your two files. Use #8 on a different AI.
Nothing from the coach is stored on the server.

## Accounts and privacy
- Email + password (scrypt), HttpOnly session cookie, same-origin check on writes, rate limits, CSP.
- Analysis needs no login and stores nothing. Logged-in users may store CV text for 30 days. `DELETE /api/me` (button "Delete account") removes everything.
- Admin = the email in `ADMIN_EMAIL`; `/api/admin/stats` shows usage.

## Deploy
**Vercel (works, stateless mode).** Push this folder to GitHub, import it in Vercel (Framework: Other, no build command, no env vars needed), or run `npx vercel --prod`. Vercel disks are read-only and not shared, so on Vercel: CV analysis, career coach, program search and downloads all work; **accounts, tracker and live job ingestion are turned off** (nothing is saved). In Vercel → Settings → Build and Deployment set **Framework Preset = Other** (the Express preset mistakes browser files for the server). If you see an error, open Vercel → project → Logs.

**Full mode (accounts, tracker, ingestion):** needs a persistent disk: Docker (`docker compose up --build`), Render/Railway/Fly with a volume, or a VPS. Set `COOKIE_SECURE=1`, `TRUST_PROXY=1` behind HTTPS.

## Limits
Scanned/image PDFs need OCR (not included): paste text instead. English CVs work best. Back up `/data`.
