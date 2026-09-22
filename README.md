# Readyroom

A private interview-preparation workspace: paste a job description and a company URL, choose 1–60 days, then research, edit, and practise a preparation kit.

Built for the supplied Trao assessment. The kit keys follow Appendix A, and the batch entry point/output follow Appendix B. Next.js + React + Tailwind CSS provide the frontend; Express handles the API and sessions; MongoDB stores users, kits, jobs and practice history. All application code is JavaScript.

## Run locally

Requires Node.js 22.18+ and npm. In this delivered workspace, **`.env` already exists with the supplied MongoDB and Gemini credentials**. It is git-ignored. There is intentionally no `.env.example`, as requested.

```sh
npm ci
npm run dev
```

Open **http://localhost:3000**, create an account, and create a prep kit. The Express server runs Next.js and the durable job worker together on the same port. On Windows with restricted PowerShell execution policy, use `npm.cmd` instead of `npm`.

Next.js handles frontend hot reload. The server deliberately runs without Node's recursive import watcher, which can restart the process when Next.js writes compiled pages and interrupt browser requests. After changing backend files or `.env`, stop the terminal with Ctrl+C and run `npm run dev` again.

For a fresh clone, run `npm run setup` after installation. It creates a **real `.env`** without overwriting an existing one. Fill in your own MongoDB URI and Gemini key using the variable reference below. The evaluator works without MongoDB and has a labelled, source-grounded fallback when no AI key is configured.

```sh
npm run verify:connections
npm test
npm run build
```

Production: set `APP_ORIGIN` to your HTTPS origin, then `npm run build && npm start`. `npm start` enables production protections, including secure cookies and rejection of private research destinations. Put it behind an HTTPS reverse proxy; set `TRUST_PROXY=1` only when exactly one trusted proxy sits in front of the server. For local HTTP use `npm run dev` so session cookies can be set.

## Configuration

| Variable              | Purpose / default                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------------------- |
| `MONGODB_URI`         | Required by the web server. Include a database name, e.g. `/readyroom`. Never exposed to the client.      |
| `SESSION_SECRET`      | Required by the server: at least 32 characters. Setup generates 48 random bytes.                          |
| `GEMINI_API_KEY`      | Gemini credential. Optional for evaluation; absent/unavailable AI triggers a visible fallback.            |
| `GEMINI_MODEL`        | `gemini-3.5-flash-lite`. Verified with the supplied key. Configurable because model availability changes. |
| `LLM_MIN_INTERVAL_MS` | Minimum interval between model calls; default `6500`. Adjust upward for your account's actual quota.      |
| `LLM_TIMEOUT_MS`      | Per-request model timeout; default `20000`.                                                               |
| `PORT`                | `3000`.                                                                                                   |
| `APP_ORIGIN`          | `http://localhost:3000` in development; required public HTTPS origin in production.                       |
| `ALLOW_PRIVATE_URLS`  | Web research defaults to `false`. Explicit `true` permits local fixtures **only outside production**.     |
| `LLM_DISABLED`        | `true` selects deterministic fallback for tests/offline use. Omit for real generation.                    |
| `TRUST_PROXY`         | Set `1` only with one trusted reverse proxy for HTTPS secure-cookie deployments.                          |
| `PLAYWRIGHT_CHANNEL`  | Browser tests default to installed `msedge`; use `chrome` when that is installed instead.                 |
| `TEST_URL`            | Browser-test target; defaults to `http://localhost:3000`.                                                 |

The provider uses the [Gemini generateContent API](https://ai.google.dev/api/generate-content) in JSON mode, with local Zod validation. [Quotas](https://ai.google.dev/gemini-api/docs/rate-limits) vary by account and model. The code does not enable paid search grounding or require a billing account. Choose an available free-tier model for your account; a quota error is a recoverable state, not an invitation to turn on paid billing.

## Mandatory batch command

```sh
npm run evaluate -- --input examples/cases.json --output output/kits.json
```

Input is an array of `{ "id": "case-01", "jd": "...", "company_url": "https://...", "days": 5 }`. Output is:

```json
{
  "version": "1.0",
  "generated_at": "2026-09-22T00:00:00.000Z",
  "kits": [
    { "id": "case-01", "status": "ok", "kit": {}, "error": null },
    {
      "id": "case-02",
      "status": "failed",
      "kit": null,
      "error": { "code": "INVALID_INPUT", "message": "..." }
    }
  ]
}
```

The actual `kit` is the complete Appendix A object, never the empty placeholder above. One failed case does not abort the others. A missing company page, thin posting or empty public-discussion search yields `ok` with honest warnings. Only inability to produce a valid kit yields `failed`. Malformed top-level input exits nonzero because there is no valid case array to process.

Batch and web call the **same `generateKit()` implementation**. The CLI does not require a running server or MongoDB. Non-production evaluation explicitly permits localhost and relative-link fixtures; production always prohibits private addresses. Each case has a 160-second generation budget, with bounded crawling and retries; five cases target under 15 minutes. Slow providers degrade to templates rather than causing unbounded retries.

## Pipeline and decisions

1. **Extract** role metadata and requirements from the pasted text; no job-board retrieval. A model identifies technical, behavioural and domain requirements and preserves must/nice wording. Every requirement must quote the source description; unsupported extraction is discarded. A conservative quotation-based check recovers explicit skills/duties that the model omitted. Titles alone are never treated as competencies. IDs are hashes of normalized quoted text.
2. **Research** the supplied homepage, clean HTML and rank links by anchor text and URL. Follow discovered interview/hiring, handbook, engineering, careers and about links on the same origin, including relative paths. There is no guessed list of company paths. At most seven company pages are attempted. `/robots.txt` is policy discovery, not a hard-coded hiring path.
3. **Look for public discussion** through the public [Hacker News Algolia API](https://hn.algolia.com/api). Query company name plus “interview”, retain company-matching comments, link their original Hacker News pages and mark them unverified. No claim is made that this searches every community. No Reddit, Glassdoor, authenticated or paywalled content is scraped.
4. **Write the company brief** using retrieved evidence, retaining only actually retrieved source URLs. If retrieval fails, explicitly say the company could not be verified. Template briefs are labelled excerpts, not synthesized factual claims.
5. **Generate category-specific questions** using separate instructions/calls for technical, behavioural, system-design and company-fit material. The input includes the exact requirement IDs and discovered hiring-process evidence. Take-home/system-design stages change the question framing. Behavioural answers guide real STAR examples instead of inventing candidate stories.
6. **Check coverage in code.** Compare exact requirement IDs against all questions. If anything is missing, a second model pass requests the missing questions only. Check again; a targeted, source-quoted template supplies any remaining gap. Two model passes bound time and cost while guaranteeing no generated must-have requirement is uncovered. `coverage.passes` is the number of model drafting/coverage passes; deterministic repair follows the second check when needed.
7. **Create flashcards** from the question/answer pairs, with stable references. This retains the grounded answer rather than spending another model call paraphrasing it.
8. **Allocate the schedule in code**, never through an LLM. Sort must-have material ahead of nice-to-haves, then difficulty descending. Partition first encounters across the requested days. If there are more days than questions, later days review existing material. Every day has integer minutes, focus and valid question IDs. An empty posting gets honest recruiter/research tasks instead of invented technical topics.
9. **Validate** the complete kit with Zod plus referential checks: unique IDs, valid references, exact sequential day count, integer durations, accurate coverage and every generated must-have scheduled. Only then persist or export.

### Rate limits and fallback

The worker processes jobs one at a time. Model calls are globally serialized in the server process, with a minimum interval, bounded input/output, request timeouts, and three attempts. HTTP 429/5xx honors `Retry-After` (seconds or dates) with jitter; other transient failures use the bounded call interval. Invalid JSON/structure is retried, then replaced by validated templates. Invalid keys or model configuration open a five-minute circuit breaker to avoid repeated rejected calls. Research requests are paced, honor robots crawl-delay, retry transient failures and stop at their deadline.

The UI and research log say **AI**, **mixed**, or **fallback**. A template kit is useful for offline testing but is not presented as equivalent to a fully generated AI kit. The fallback never fabricates company facts. Gemini credentials remain server-side.

## Builder, persistence and concurrency

- Local React state makes text edits/reordering immediate. Explicit **Save** persists the draft, with an unsaved indicator and leave-page protection. All questions, answer outlines, flashcards, brief text, role information, requirements and schedule fields are editable. The full JSON editor covers any remaining metadata and arbitrary array ordering; exported JSON includes the current local draft.
- Questions/cards carry `origin: generated | edited | manual` and `pinned`. The server compares submitted fields to the stored version, so a client cannot accidentally relabel a manual edit as generated. Moving a question to a new category also counts as editing.
- Category regeneration retains every manual, edited or pinned question, including questions moved from another category. It replaces only untouched generated questions in that category. Other categories, flashcards and brief edits survive. Existing schedule focus/durations are retained; old question IDs are reconciled by requirement overlap and newly introduced questions are added to the first day. Regenerating the **schedule itself** intentionally replaces that section. Regenerating the **brief itself** intentionally replaces that brief.
- Kits have an integer revision. Saves and worker writes compare-and-swap that revision. If an edit wins while regeneration is running, regeneration fails with a conflict; it never clobbers the edit. Separate-tab conflicts retain the local draft for export/reconciliation.
- User edits may deliberately remove a requirement's last question. These are stored as `draft: true`, with accurate visible gaps. Generated/evaluated kits enforce complete must-have coverage; manual drafts permit incompleteness so “delete a question” really works. Regenerate the category or add/link a replacement question to repair it.
- MongoDB stores the input, current kit, revision, practice ratings and jobs. Jobs return immediately with `202`; the UI polls stage/progress/error state. A pending job intent is saved atomically with the kit, so the worker can recover an interrupted queue insertion. Queued work resumes on restart; a running job's four-minute lease can be reclaimed. This is an intentionally small single-worker deployment, not a distributed queue service.
- A per-user unique fingerprint of normalized description, company URL and days coalesces duplicate requests, including races. Different users never share records or edit state. Reuse is explicit: repeat input opens the existing kit; its sections can be regenerated. Failed kits can be retried.

## Practice

Flashcards show one prompt at a time. Reveal the answer, then record **Needs work / Getting there / Confident**. Store confidence, review count and last-reviewed timestamp per card. A session freezes its order to avoid skipping cards as scores change. New sessions order unseen cards first, then least confident, then least recently reviewed. This simple, inspectable rule is appropriate for a short interview deadline; no unsupported long-term spaced-repetition claims. Coverage counts only current card IDs.

## Security and source handling

- Bcrypt password hashing (cost 12), server-side MongoDB sessions, session rotation on login/register, HttpOnly + SameSite cookies, secure cookies in production, seven-day expiry and logout invalidation. Protected page requests redirect to login; protected endpoints return structured 401 errors. Every kit lookup includes the session user's ID. Login/registration and generation routes are rate limited.
- Mutations require a custom request header and reject mismatched Origin headers. Cross-origin JavaScript cannot add that header without an allowed CORS preflight; the app does not enable CORS. API request bodies are size-limited and schema-validated.
- External requests allow HTTP(S) only, reject URL credentials, validate all DNS results, block private/reserved/loopback/link-local and IPv4-mapped IPv6 destinations in production, and pin connections to those validated addresses. Every redirect is revalidated, including robots permissions. The same protections apply to the CLI in production.
- Only HTML/XHTML, robots plain text and the expected public JSON API are accepted. Responses are streamed with a 4 MB cap and request timeouts. This accommodates large server-rendered sites such as PostHog while keeping memory bounded; cleaned model text is capped separately. Scripts/styles/forms/iframes are removed from pages. External links are protocol-checked in the UI; text is rendered by React without HTML injection.
- Robots rules and crawl delays are honored. A missing robots file (404/410) permits fetching; unreadable/disallowed robots policy skips that source. No access controls or bot blocks are bypassed. Site-specific terms can impose further restrictions: use only authorized sites and disable retrieval for any source whose terms prohibit it. This application does not claim to interpret arbitrary legal terms automatically.
- All job-description/page text enters the model as explicitly untrusted JSON data, separate from system instructions. Models are never given tools, secrets, SQL or file access. Grounding and reference validation constrain output, but prompt-injection resistance is layered mitigation, not a proof that models cannot be influenced.

## Tests and verification

```sh
npm test                       # local core/retrieval/provider regression suite
npm run verify:api             # live MongoDB, isolated temporary test database
npm run verify:batch           # full CLI path with local company fixtures, no AI calls
npm run verify:batch -- --live # same cases with real Gemini
npm run test:e2e               # app must be running; installed Edge by default
npm run build
```

API verification deletes only its uniquely named `readyroom_test_*` database. Browser verification creates a unique test user, then deletes that user and its kits/jobs/sessions. It checks registration, protected routes, generation, edits, save/reopen, confidence recording, mobile overflow and logout. Screenshots go to git-ignored `output/`; failure traces to `test-results/`. To use Playwright Chromium instead of a locally installed browser, remove/set the channel configuration and run `npx playwright install chromium`.

Core tests cover 1/60-day schedules, prioritization, exact coverage, dangling IDs, integer durations, draft gaps, edit-preserving regeneration, live localhost crawling, robots exclusions, redirects, response sizes/types, private addresses, 429/invalid-JSON recovery, thin postings and the second coverage pass. A separate batch harness exercises five successful edge cases plus one invalid case through the actual CLI.

## Project map

```text
frontend/
  app/                  Next.js routes and responsive stylesheet
  components/           Auth, workspace, kit editor, practice and shared UI
  next.config.mjs       Next.js configuration
  postcss.config.mjs    Tailwind CSS configuration
backend/
  server/               Express API, authentication, MongoDB and job worker
  src/research/         Secure retrieval, HTML cleaning, crawling and discussions
  src/ai/               Gemini, retries, validation and fallback
  src/core/             Pipeline, schemas, scheduling, coverage and edit-preserving merge
scripts/                Batch entry point, setup and verification commands
tests/                  Automated regression and browser tests
.env                    Server credentials (local and git-ignored)
package.json            Shared dependencies and root commands
```

Run all commands from the project root. Both folders share the root dependency installation and `.env`; `npm run dev` still starts the complete app on port 3000. The editor imports the backend's pure scheduling/coverage utilities so its local preview uses the same deterministic rules; no database or AI modules are included in that client import.

## Scope and trade-offs

This is a focused assessment application: no password recovery, email verification, team sharing, CV rewriting, job-board fetching or payments. There is no speculative “mock interview score.” The useful extra is JSON export for keeping a portable copy of the current draft.

Crawling is same-origin and HTML-only; a hiring portal linked on another domain, a JavaScript-only careers site or a blocked source is reported as a limitation instead of silently guessed. Public-discussion coverage is intentionally limited to Hacker News. A hostname-derived company name is a fallback, not a claim of identity. Quotas can still make a run use templates. Multi-instance deployment would need a shared provider token limiter and a dedicated queue worker; this deployment uses one process and one worker.
