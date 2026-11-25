# MacroLens — Smart AI Calorie & Macro Tracker

MacroLens is a full-stack web application for tracking daily nutrition, hydration, body weight, and fitness habits, powered by Google Gemini AI, Open Food Facts, MySQL, and Vercel Serverless Functions.

## Team & Contributors

- **Samiul Hoque Chowdhury** `[232-115-368]`
- **Farhan Ahmed** `[232-115-349]`
- **Rokshana Islam Roita** `[222-115-077]`

Department of Computer Science & Engineering, Metropolitan University, Sylhet.

---

## Key Features

- **AI Food Analysis (Text & Photo):** Natural language meal parsing and compressed photo recognition via an authenticated, rate-limited Gemini 2.5 Flash proxy (`/api/gemini`).
- **Barcode Scanner:** Camera and manual UPC/EAN lookup via Open Food Facts with accurate per-serving vs. per-100g nutritional scaling.
- **Unified TDEE & Personalized Targets:** Single shared nutrition engine (`js/nutrition.js`) for BMR, TDEE, macro splits, hydration (`ml`), fiber, sugar, and sodium targets supporting both metric (`kg`, `cm`) and imperial (`lbs`, `ft/in`) units.
- **Conflict-Tolerant Multi-Device Sync:** Incremental per-record upserts keyed by record ID with `updated_at` versioning, tombstone deletions, monotonic achievement unions, and chronological coach thread message merging (`js/sync-merge.js`, `/api/data/sync`).
- **AI Fitness Coach:** Context-aware coaching backed by persistent multi-thread history and DOMPurify-sanitized output.
- **Analytics & Reports:** Daily calorie and weight trend charts (`Chart.js`) plus native PDF (`jsPDF`) and CSV report exports.

---

## Security Architecture

- **Server-Side Sessions (`api/_lib/auth.js`):** Signing up or logging in creates a DB-backed session row in MySQL (`sessions`) and issues a signed, expiring (`7d`) `HS256` JWT stored in an `HttpOnly`, `SameSite=Lax`, `Secure` cookie (`caltrack_session`).
- **Strict Access Control:** All protected routes (`/api/data/sync`, `/api/data/reset`, `/api/gemini`) derive `userId` strictly from the verified server session cookie and ignore client-supplied identity headers/parameters. Logging out revokes the session row server-side.
- **XSS & CSP Hardening:** Dynamic UI rendering uses `textContent` and DOM element builders; formatted AI output is HTML-escaped and sanitized with `DOMPurify`. HTTP headers in `vercel.json` enforce a strict Content Security Policy without `'unsafe-inline'` in `script-src`, alongside `X-Frame-Options: DENY` and `X-Content-Type-Options: nosniff`.
- **Gemini Proxy Protection (`api/gemini.js`):** Requires an authenticated session (`401` otherwise), enforces a MySQL-backed per-user rate limit (`429`), caps payload size at 2 MB (`413`), and validates turn counts, text lengths, and image MIME types (`400`).

---

## Tech Stack

- **Frontend:** Vanilla JavaScript (ES2022), HTML5, CSS3, DOMPurify, Chart.js, Lucide Icons, jsPDF
- **Backend:** Vercel Serverless Functions (Node.js)
- **Database:** Aiven Cloud MySQL 8.4 (`mysql2/promise` over SSL)
- **External APIs:** Google Gemini 2.5 Flash API, Open Food Facts API v2
- **Testing & Quality:** Vitest (`jsdom`), ESLint, Playwright + Axe Accessibility, Grafana k6

---

## Local Setup & Commands

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   Copy `.env.example` to `.env` and fill in your credentials:
   ```bash
   cp .env.example .env
   ```
   Required variables:
   - `MYSQL_URL` — MySQL connection string
   - `GEMINI_API_KEY` — Google Gemini API key
   - `SESSION_SECRET` — 64+ character hex secret for JWT session signing

3. **Run database schema migration:**
   ```bash
   npm run migrate
   ```
   Applies [`migrations/001_schema.sql`](migrations/001_schema.sql) and backfills any legacy diary, water, weight, or coach records idempotently.

4. **Run unit tests and linter:**
   ```bash
   npm run lint
   npm test
   ```

5. **Run multi-browser E2E & accessibility audit (Chromium, Firefox, WebKit):**
   ```bash
   npm run test:e2e
   ```

6. **Run k6 load/concurrency test:**
   ```bash
   k6 run k6/load-test.js
   ```

7. **Run Gemini nutrition accuracy benchmark:**
   ```bash
   node scripts/gemini-accuracy-audit.js
   ```

---

## Live Production Audit Results (`https://caltrack-amber.vercel.app`)

| Audit Check | Scope & Tool | Verified Result |
| :--- | :--- | :--- |
| **Linting & Static Checks** | `npm run lint` (ESLint) | **0 errors, 0 warnings** |
| **Unit & Regression Tests** | `npm test` (Vitest + jsdom) | **24 / 24 passed** across 5 test files |
| **Access Control & Proxy Guards** | `scripts/live-security-sync-audit.js` | Spoofed `Authorization` (`401`), revoked session (`401`), Gemini rate limit (`429`), oversized payload (`413`) all enforced |
| **Multi-Device Sync Merge** | `scripts/live-security-sync-audit.js` | Concurrent meal logs & coach thread messages merged without overwrites |
| **AI Nutrition Estimate Error** | `scripts/gemini-accuracy-audit.js` (5 weighed USDA reference meals via live `/api/gemini`) | **Calories MAE: 1.8 kcal (0.6% MAPE)** · Protein MAE: 1.0g · Carbs MAE: 0.2g · Fat MAE: 0.3g |
| **Load & Concurrency** | `k6 run k6/load-test.js` (9 max VUs: 8 concurrent sync VUs + security probe) | **57 / 57 checks passed (100%)**, `0.00%` app/HTTP errors, sync `p(95) = 4.46s` |
| **Cross-Browser & Accessibility** | `npx playwright test` + `@axe-core/playwright` (Chromium, Firefox, WebKit) | **6 / 6 passed**, **0 critical/serious WCAG 2.1 AA violations** across all views, 0 CSP/console errors |

---

## License

Licensed under the [MIT License](LICENSE).
