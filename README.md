# Clinical Trial Extraction Review

A reviewer UI for evaluating LLM-based structured-data extraction from
clinicaltrials.gov trials.

- Pulls **5 completed trials per cancer type** (21 cancer types).
- Runs both extractors (basic eligibility + cancer-specific descriptors)
  using `gpt-5.5` with high reasoning effort.
- Reviewers go through each trial — **eligibility text on the left,
  extracted variables on the right** — and approve, edit, or null each field.
- Multi-user with per-user progress tracking, persisted in Postgres.

## Setup

### 1. Install
```bash
npm install
```

### 2. Provision a Postgres database
Create a free Neon database at https://neon.tech (~30 sec). Copy the
connection string.

### 3. Fill `.env.local`
The `OPENAI_API_KEY` is already populated. Add your `DATABASE_URL`:
```
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.5
DATABASE_URL=postgres://user:pass@xxx.neon.tech/db?sslmode=require
```

### 4. Initialize the database
```bash
npm run init-db
```
Creates `users` and `reviews` tables.

### 5. Fetch trials and run extraction
```bash
npm run fetch
```
This will take a few minutes — it queries CT.gov for each cancer type, runs
both LLM extractors, and writes `data/trials.json`. Re-run any time to
refresh.

### 6. Start the dev server
```bash
npm run dev
```
Open http://localhost:3000.

## Deploying to Vercel

1. Push to a git repo.
2. Import into Vercel.
3. In project settings, add env vars `OPENAI_API_KEY`, `OPENAI_MODEL`, `DATABASE_URL`.
4. Commit `data/trials.json` so production has the trial data (it's read at
   runtime from the deployed bundle).
5. Deploy.

> The OpenAI key is **only** used by the local fetch script — production
> reads the static `data/trials.json` and only writes review state to
> Postgres. So technically you don't need `OPENAI_API_KEY` in Vercel env.

## How review works

- Pick or create a reviewer on the home page.
- Trial list shows progress (0 of 100, etc.) and groups trials by cancer type.
- Each trial's review page has:
  - Left column: title, conditions, interventions, summary, eligibility text.
  - Right column: extracted fields, grouped by section. Each field has a
    checkbox (approve), and an inline editor (dropdown / multi-select /
    yes-no-null / number).
  - Edits are auto-saved (debounced ~800ms).
  - "Mark done & next" advances to the next trial.

## Project structure

- `scripts/fetch-and-extract.ts` — pulls CT.gov data and runs extraction
- `scripts/init-db.ts` — creates Postgres tables
- `src/lib/extractors/` — LLM extractors (basic + cancer-specific)
- `src/lib/schema/field-schemas.ts` — UI field metadata for all 21 cancer types
- `src/app/` — Next.js routes (App Router)
- `src/components/ReviewClient.tsx` — review screen
- `data/trials.json` — generated trial + extraction data (committed)
