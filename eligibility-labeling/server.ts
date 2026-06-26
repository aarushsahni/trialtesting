// Self-contained manual-labeling tool. Pick a ClinicalTrials.gov NCT id,
// the server fetches the trial JSON directly from the CT.gov v2 API, and
// the browser UI lets a labeler define cohorts (applicable cancer types,
// age / ECOG / LOT bounds, per-cancer-type clinical descriptors). Saves
// land in ./eligibility-labels/<NCT>.json next to this file.
//
// No project imports, no database, no env vars. Run with:
//   npm install && npm start
// or directly:
//   npx tsx server.ts
//
// Override the port with PORT=5555 npm start.

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TRIAL_SCHEMAS, CANCER_TYPE_LABELS, type CancerType } from './schemas';

const PORT = Number(process.env.PORT ?? 4322);
// __dirname is fine in tsx's default CommonJS runtime; we also derive it from
// import.meta.url so the same source works if the recipient switches to ESM.
const ROOT = typeof __dirname !== 'undefined'
  ? __dirname
  : dirname(fileURLToPath(import.meta.url));
const LABELS_DIR = join(ROOT, 'eligibility-labels');
const indexHtml = readFileSync(join(ROOT, 'index.html'), 'utf8');
const fieldDescriptions = JSON.parse(
  readFileSync(join(ROOT, 'field-descriptions.json'), 'utf8')
);

interface CTGovStudy {
  protocolSection?: {
    identificationModule?: { nctId?: string; briefTitle?: string; officialTitle?: string };
    descriptionModule?: { briefSummary?: string };
    conditionsModule?: { conditions?: string[] };
    armsInterventionsModule?: { interventions?: { name?: string }[] };
    designModule?: { phases?: string[] };
    statusModule?: { overallStatus?: string };
    eligibilityModule?: { eligibilityCriteria?: string };
  };
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  return JSON.parse(raw);
}

function validNct(nctId: string): boolean {
  return /^NCT\d{8}$/.test(nctId);
}

function labelPath(nctId: string): string {
  return join(LABELS_DIR, `${nctId}.json`);
}

async function ensureLabelsDir() {
  await mkdir(LABELS_DIR, { recursive: true });
}

// Fetches a single study from ClinicalTrials.gov v2. The API has no auth and
// no rate limit at small scale. Returns null when the NCT id isn't found or
// is malformed per CT.gov; throws on any other upstream error.
async function fetchTrialFromCTGov(nctId: string) {
  const url = `https://clinicaltrials.gov/api/v2/studies/${nctId}?format=json`;
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (r.status === 404 || r.status === 400) return null;
  if (!r.ok) throw new Error(`CT.gov returned ${r.status} for ${nctId}`);
  const study = (await r.json()) as CTGovStudy;
  const p = study.protocolSection ?? {};
  return {
    nctId: p.identificationModule?.nctId ?? nctId,
    briefTitle: p.identificationModule?.briefTitle ?? '',
    officialTitle: p.identificationModule?.officialTitle ?? null,
    briefSummary: p.descriptionModule?.briefSummary ?? null,
    phase: p.designModule?.phases?.[0] ?? null,
    status: p.statusModule?.overallStatus ?? null,
    conditions: p.conditionsModule?.conditions ?? [],
    interventions: (p.armsInterventionsModule?.interventions ?? [])
      .map((i) => i.name)
      .filter((n): n is string => Boolean(n)),
    eligibilityRaw: p.eligibilityModule?.eligibilityCriteria ?? null,
    ctGovUrl: `https://clinicaltrials.gov/study/${nctId}`,
  };
}

async function handleTrial(res: ServerResponse, nctId: string) {
  const trial = await fetchTrialFromCTGov(nctId);
  if (!trial) return sendJson(res, 404, { error: `Trial ${nctId} not found on ClinicalTrials.gov` });
  sendJson(res, 200, trial);
}

function handleSchemas(res: ServerResponse) {
  const cancerTypes = (Object.entries(CANCER_TYPE_LABELS) as [CancerType, string][])
    .map(([key, label]) => ({ key, label }));
  sendJson(res, 200, {
    cancerTypes,
    schemas: TRIAL_SCHEMAS,
    fieldDescriptions,
  });
}

async function handleGetLabel(res: ServerResponse, nctId: string) {
  const path = labelPath(nctId);
  if (!existsSync(path)) return sendJson(res, 404, { error: 'Not labeled' });
  const raw = await readFile(path, 'utf8');
  res.writeHead(200, { 'Content-Type': 'application/json' });
  return res.end(raw);
}

async function handleSaveLabel(req: IncomingMessage, res: ServerResponse, nctId: string) {
  const body = (await readJsonBody(req)) as Record<string, unknown>;
  if (!body || typeof body !== 'object') return sendJson(res, 400, { error: 'Body must be a JSON object' });
  if (body.nctId !== nctId) return sendJson(res, 400, { error: 'nctId mismatch between path and body' });
  await ensureLabelsDir();
  await writeFile(labelPath(nctId), JSON.stringify(body, null, 2), 'utf8');
  sendJson(res, 200, { ok: true });
}

async function handleListLabels(res: ServerResponse) {
  if (!existsSync(LABELS_DIR)) return sendJson(res, 200, { labels: [] });
  const files = await readdir(LABELS_DIR);
  const labels = files
    .filter((f) => /^NCT\d{8}\.json$/.test(f))
    .map((f) => f.replace(/\.json$/, ''))
    .sort();
  sendJson(res, 200, { labels });
}

const ROUTES: {
  method: 'GET' | 'POST';
  pattern: RegExp;
  handler: (req: IncomingMessage, res: ServerResponse, match: RegExpMatchArray) => unknown | Promise<unknown>;
}[] = [
  {
    method: 'GET',
    pattern: /^\/$/,
    handler: (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(indexHtml);
    },
  },
  { method: 'GET', pattern: /^\/api\/descriptor-schemas$/, handler: (_req, res) => handleSchemas(res) },
  { method: 'GET', pattern: /^\/api\/labels$/, handler: (_req, res) => handleListLabels(res) },
  {
    method: 'GET',
    pattern: /^\/api\/trial\/(NCT\d{8})$/,
    handler: (_req, res, m) => handleTrial(res, m[1]),
  },
  {
    method: 'GET',
    pattern: /^\/api\/label\/(NCT\d{8})$/,
    handler: (_req, res, m) => handleGetLabel(res, m[1]),
  },
  {
    method: 'POST',
    pattern: /^\/api\/label\/(NCT\d{8})$/,
    handler: (req, res, m) => handleSaveLabel(req, res, m[1]),
  },
];

const server = createServer(async (req, res) => {
  try {
    const url = (req.url ?? '/').split('?')[0];
    for (const route of ROUTES) {
      if (req.method !== route.method) continue;
      const m = url.match(route.pattern);
      if (!m) continue;
      const nctSegment = m[1];
      if (nctSegment && !validNct(nctSegment)) {
        return sendJson(res, 400, { error: 'nctId must match NCT followed by 8 digits' });
      }
      return await route.handler(req, res, m);
    }
    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: (err as Error).message });
  }
});

server.listen(PORT, () => {
  console.log(`Eligibility labeling tool: http://localhost:${PORT}`);
});
