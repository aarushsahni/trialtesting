// Field-by-field comparison of two expert annotations of one trial, and the
// merge of that comparison with reviewer decisions into one adjudicated label.
// Shared by the adjudication screen, the adjudication queue and the label
// export, so "open", "agreed" and the final value mean the same thing in every
// place. Pure — safe to import client-side.
//
// Before comparing, each annotation is normalized (normalizeAnswers):
//   - A cohort's age/ECOG bound that is blank takes the trial-level value.
//   - Blank rules: a multi-select descriptor with every option ticked is blank
//     (the guide's "no restriction" rule; prior-therapy fields excepted, since
//     excluding every prior therapy is a real constraint), and ECOG min 0, min
//     prior lines 0 and min relapse number 0 are blank.
//   - Trial-level fields are derived from the cohorts: cancer types are the
//     union of the cohorts' types; min age / ECOG min are the lowest cohort
//     value and max age / ECOG max the highest (blank if any cohort is blank).
//
// Cohorts are paired by content (pairCohorts), not by creation order, unless
// the reviewer saved a pairing. A cohort, or a cancer type within a cohort,
// that only one annotator has needs one decision (keep it or not); its fields
// then take that annotator's values without further review.
//
// A reviewer can also add a cohort neither annotator drew (AddedCohort). Its
// fields start blank and are filled in with ordinary decisions.

import { BLOCKS } from './schema/field-schemas';
import { hungarian } from './hungarian';
import {
  ALL_CANCER_TYPES, BlockAnswers, CANCER_TYPE_DEFINITIONS, CancerType, Cohort, FieldDef,
  FieldValue, TRIAL_LEVEL_SENTINEL, TrialAnswers,
} from './types';

export const TRIAL_LEVEL_DEFS: Record<string, FieldDef> = {
  cancerTypes: { kind: 'multi', label: 'Cancer types', options: ALL_CANCER_TYPES, optionHelp: CANCER_TYPE_DEFINITIONS, class: 'other' },
  minAge:      { kind: 'number', label: 'Min age',  class: 'other' },
  maxAge:      { kind: 'number', label: 'Max age',  class: 'other' },
  ecogMin:     { kind: 'number', label: 'ECOG min', class: 'other' },
  ecogMax:     { kind: 'number', label: 'ECOG max', class: 'other' },
};
export const COHORT_LEVEL_DEFS: Record<string, FieldDef> = {
  minAge:      { kind: 'number', label: 'Min age (cohort)',  class: 'other' },
  maxAge:      { kind: 'number', label: 'Max age (cohort)',  class: 'other' },
  ecogMin:     { kind: 'number', label: 'ECOG min (cohort)', class: 'other' },
  ecogMax:     { kind: 'number', label: 'ECOG max (cohort)', class: 'other' },
};
export const COHORT_EXISTS_FIELD = '__cohort_exists__';
export const COHORT_TYPES_FIELD = '__cancer_types__';
// Reviewer-saved cohort pairing, stored as one trial_adjudications row.
export const COHORT_MAP_FIELD = '__cohort_map__';
// The adjudicator's free-text explanation for the trial, stored the same way ({v: string}).
export const ADJUDICATION_NOTE_FIELD = '__adjudication_note__';
// A cohort added by the reviewer: one row per cohort, under its own cohort key
// ({v: {displayName, cancerTypes, createdAt}}).
export const ADDED_COHORT_FIELD = '__added_cohort__';
export const ADDED_COHORT_PREFIX = 'ADJ:';

const COHORT_EXISTS_DEF: FieldDef = { kind: 'bool', label: 'Cohort belongs on final label', class: 'other' };
export const COHORT_TYPES_DEF: FieldDef = {
  kind: 'multi', label: 'Cancer types in cohort', options: ALL_CANCER_TYPES,
  optionHelp: CANCER_TYPE_DEFINITIONS, class: 'other',
};

type BoundKey = 'minAge' | 'maxAge' | 'ecogMin' | 'ecogMax';
const BOUND_KEYS: BoundKey[] = ['minAge', 'maxAge', 'ecogMin', 'ecogMax'];

export type ComparisonScope = 'trial' | 'cohort' | 'descriptor' | 'cohort_existence';
export type AutoReason = 'blank_rule' | 'inherited' | 'one_sided' | 'derived';
// annotator-2 cohortKey → annotator-1 cohortKey; '' = deliberately unpaired.
export type CohortMap = Record<string, string>;

export interface AddedCohort {
  cohortKey: string;   // ADDED_COHORT_PREFIX + id
  displayName: string;
  cancerTypes: CancerType[];
  createdAt: string;
}

// The reviewer-added cohorts among a trial's trial_adjudications rows, oldest first.
export function addedCohortsFrom(rows: { cohort_key: string; field_key: string; final_value: { v: unknown } }[]): AddedCohort[] {
  return rows
    .filter((r) => r.field_key === ADDED_COHORT_FIELD)
    .map((r) => {
      const v = (r.final_value?.v ?? {}) as Partial<AddedCohort>;
      return {
        cohortKey: r.cohort_key,
        displayName: v.displayName ?? r.cohort_key,
        cancerTypes: ALL_CANCER_TYPES.filter((ct) => v.cancerTypes?.includes(ct)),
        createdAt: v.createdAt ?? '',
      };
    })
    .sort((x, y) => x.createdAt.localeCompare(y.createdAt) || x.cohortKey.localeCompare(y.cohortKey));
}

export interface ComparisonRow {
  cohortKey: string;
  cancerType: string;
  scope: ComparisonScope;
  cohortDisplayName?: string;
  fieldKey: string;
  def: FieldDef;
  a: FieldValue;       // normalized values — what is compared and exported
  b: FieldValue;
  rawA: FieldValue;    // as the annotator entered it
  rawB: FieldValue;
  agree: boolean;
  // True when both annotations exist and the reviewer has to choose. False for
  // agreements, derived trial-level rows and one-sided rows.
  needsDecision: boolean;
  // Set when only one annotator has this cohort or this cancer type in it.
  oneSided?: 'a' | 'b';
  // Why a row whose raw values differ needs no decision.
  autoReason?: AutoReason;
  // Set on the rows of a reviewer-added cohort.
  added?: boolean;
}

// Canonical form for equality: null and [] are the same, arrays are order-insensitive.
export function normValue(v: unknown): string {
  if (v === undefined || v === null) return 'null';
  if (Array.isArray(v)) {
    if (v.length === 0) return 'null';
    return JSON.stringify([...v].sort());
  }
  return JSON.stringify(v);
}

export function adjudicationKey(cohortKey: string, cancerType: string, fieldKey: string): string {
  return `${cohortKey}|${cancerType}|${fieldKey}`;
}

function isBlank(v: FieldValue | undefined): boolean {
  return v === null || v === undefined || (Array.isArray(v) && v.length === 0);
}

// ──────────────────────────────────────────────────────────────────────────
// Normalization
// ──────────────────────────────────────────────────────────────────────────

const ZERO_IS_BLANK = new Set(['ecogMin', 'minPriorSystemicLines', 'minRelapseNumber']);

// The value a field is compared and exported as. cancerType is the descriptor
// block, or TRIAL_LEVEL_SENTINEL for trial- and cohort-level fields.
export function normalizeFieldValue(cancerType: string, fieldKey: string, value: FieldValue | undefined): FieldValue {
  if (isBlank(value)) return null;
  const v = value as FieldValue;
  if (Array.isArray(v)) {
    const def = BLOCKS[cancerType as CancerType]?.fields[fieldKey];
    if (
      def?.kind === 'multi' && def.class !== 'prior_therapy' &&
      def.options && def.options.length >= 2 && def.options.every((o) => v.includes(o))
    ) return null;
    return v;
  }
  if (v === 0 && ZERO_IS_BLANK.has(fieldKey)) return null;
  return v;
}

export interface TrialLevel {
  cancerTypes: CancerType[];
  minAge: number | null;
  maxAge: number | null;
  ecogMin: number | null;
  ecogMax: number | null;
}

// Trial-level values implied by the cohorts.
export function deriveTrialLevel(cohorts: Cohort[]): TrialLevel {
  const bound = (k: BoundKey, pick: 'min' | 'max'): number | null => {
    if (cohorts.length === 0) return null;
    const vs = cohorts.map((c) => c[k]);
    if (vs.some((v) => v === null || v === undefined)) return null;
    return pick === 'min' ? Math.min(...(vs as number[])) : Math.max(...(vs as number[]));
  };
  return {
    cancerTypes: ALL_CANCER_TYPES.filter((ct) => cohorts.some((c) => c.applicableCancerTypes?.[ct])),
    minAge: bound('minAge', 'min'),
    maxAge: bound('maxAge', 'max'),
    ecogMin: normalizeFieldValue(TRIAL_LEVEL_SENTINEL, 'ecogMin', bound('ecogMin', 'min')) as number | null,
    ecogMax: bound('ecogMax', 'max'),
  };
}

export function normalizeAnswers(answers: TrialAnswers): TrialAnswers {
  const cohorts: Cohort[] = (answers.cohorts ?? []).map((c) => {
    const types: Partial<Record<CancerType, BlockAnswers>> = {};
    for (const ct of Object.keys(c.applicableCancerTypes ?? {}) as CancerType[]) {
      const block: BlockAnswers = {};
      for (const [fk, v] of Object.entries(c.applicableCancerTypes[ct] ?? {})) {
        const n = normalizeFieldValue(ct, fk, v);
        if (n !== null) block[fk] = n;
      }
      types[ct] = block;
    }
    const bound = (k: BoundKey) =>
      normalizeFieldValue(TRIAL_LEVEL_SENTINEL, k, c[k] ?? answers[k] ?? null) as number | null;
    return {
      ...c,
      applicableCancerTypes: types,
      minAge: bound('minAge'), maxAge: bound('maxAge'), ecogMin: bound('ecogMin'), ecogMax: bound('ecogMax'),
    };
  });
  const trial: TrialLevel = cohorts.length > 0 ? deriveTrialLevel(cohorts) : {
    cancerTypes: answers.cancerTypes ?? [],
    minAge: answers.minAge ?? null,
    maxAge: answers.maxAge ?? null,
    ecogMin: normalizeFieldValue(TRIAL_LEVEL_SENTINEL, 'ecogMin', answers.ecogMin) as number | null,
    ecogMax: answers.ecogMax ?? null,
  };
  return { ...answers, ...trial, cohorts };
}

// ──────────────────────────────────────────────────────────────────────────
// Cohort pairing
// ──────────────────────────────────────────────────────────────────────────

export const PAIR_FLOOR = 0.35;
const GENERIC_NAME_TOKENS = new Set([
  'cohort', 'cohorts', 'arm', 'arms', 'part', 'group', 'groups', 'main', 'phase', 'the', 'and', 'of',
]);

function nameTokens(s: string | undefined): Set<string> {
  return new Set((s ?? '').toLowerCase().split(/[^a-z0-9]+/).filter((t) => t && !GENERIC_NAME_TOKENS.has(t)));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  const union = new Set([...a, ...b]);
  if (union.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / union.size;
}

// Similarity in [0, 1] of two normalized cohorts: cancer-type overlap (double
// weight), the share of populated bounds and shared-type descriptor fields that
// agree, and display-name overlap (identical names count fully; otherwise the
// overlap of specific tokens, ignoring words like "cohort" and "arm").
export function cohortSimilarity(a: Cohort, b: Cohort): number {
  const parts: [number, number][] = [];
  const ta = new Set(Object.keys(a.applicableCancerTypes ?? {}));
  const tb = new Set(Object.keys(b.applicableCancerTypes ?? {}));
  parts.push([jaccard(ta, tb), 2]);

  let populated = 0;
  let same = 0;
  for (const k of BOUND_KEYS) {
    if (a[k] === null && b[k] === null) continue;
    populated++;
    if (a[k] === b[k]) same++;
  }
  for (const ct of ta) {
    if (!tb.has(ct)) continue;
    const ba = a.applicableCancerTypes[ct as CancerType] ?? {};
    const bb = b.applicableCancerTypes[ct as CancerType] ?? {};
    for (const fk of new Set([...Object.keys(ba), ...Object.keys(bb)])) {
      populated++;
      if (normValue(ba[fk]) === normValue(bb[fk])) same++;
    }
  }
  if (populated > 0) parts.push([same / populated, 1]);

  const sameName = !!a.displayName?.trim() && a.displayName.trim().toLowerCase() === b.displayName?.trim().toLowerCase();
  const na = nameTokens(a.displayName);
  const nb = nameTokens(b.displayName);
  if (sameName) parts.push([1, 1]);
  else if (na.size > 0 && nb.size > 0) parts.push([jaccard(na, nb), 1]);

  const weight = parts.reduce((s, [, w]) => s + w, 0);
  return parts.reduce((s, [v, w]) => s + v * w, 0) / weight;
}

export interface CohortPair {
  key: string;          // annotator 1's cohortKey, or `B:<key>` for a cohort only annotator 2 has
  a?: Cohort;
  b?: Cohort;
  score: number | null; // similarity of a paired cohort
}

// Pairs annotator 1's cohorts with annotator 2's. With a saved map the
// reviewer's pairing is used as is; otherwise the Hungarian algorithm picks
// the pairing with the highest total similarity and pairs below PAIR_FLOOR are
// left unpaired — except when each annotator drew a single cohort, which are
// always paired. `prefixB` is false when there is no annotator 1 to collide with.
export function pairCohorts(a: Cohort[], b: Cohort[], map?: CohortMap | null, prefixB = true): CohortPair[] {
  const aKeys = new Set(a.map((c) => c.cohortKey));
  const partner = new Map<string, Cohort>(); // annotator-1 key → annotator-2 cohort
  if (map) {
    for (const cb of b) {
      const ak = map[cb.cohortKey];
      if (ak && aKeys.has(ak) && !partner.has(ak)) partner.set(ak, cb);
    }
  } else if (a.length > 0 && b.length > 0) {
    const sim = a.map((ca) => b.map((cb) => cohortSimilarity(ca, cb)));
    // A small bonus for the same key keeps creation order as the tie-breaker.
    const cost = sim.map((row, i) => row.map((s, j) => 1 - s - (a[i].cohortKey === b[j].cohortKey ? 0.01 : 0)));
    hungarian(cost).forEach((j, i) => {
      if (j >= 0 && (sim[i][j] >= PAIR_FLOOR || (a.length === 1 && b.length === 1))) partner.set(a[i].cohortKey, b[j]);
    });
  }
  const pairs: CohortPair[] = a.map((ca) => {
    const cb = partner.get(ca.cohortKey);
    return { key: ca.cohortKey, a: ca, b: cb, score: cb ? Math.round(cohortSimilarity(ca, cb) * 100) / 100 : null };
  });
  const used = new Set([...partner.values()].map((c) => c.cohortKey));
  for (const cb of b) {
    if (!used.has(cb.cohortKey)) pairs.push({ key: prefixB ? `B:${cb.cohortKey}` : cb.cohortKey, b: cb, score: null });
  }
  return pairs;
}

// The saved-map form of a pairing.
export function cohortMapOf(pairs: CohortPair[]): CohortMap {
  const map: CohortMap = {};
  for (const p of pairs) if (p.b) map[p.b.cohortKey] = p.a ? p.a.cohortKey : '';
  return map;
}

// ──────────────────────────────────────────────────────────────────────────
// Comparison rows
// ──────────────────────────────────────────────────────────────────────────

function get(obj: unknown, fieldKey: string): FieldValue {
  if (!obj) return null;
  const v = (obj as Record<string, FieldValue>)[fieldKey];
  return v === undefined ? null : v;
}

function typesOf(c: Cohort | undefined): FieldValue {
  if (!c) return null;
  const types = ALL_CANCER_TYPES.filter((ct) => c.applicableCancerTypes?.[ct]);
  return types.length ? types : null;
}

export function pairsFor(a: TrialAnswers | undefined, b: TrialAnswers | undefined, map?: CohortMap | null): CohortPair[] {
  const na = a && normalizeAnswers(a);
  const nb = b && normalizeAnswers(b);
  return pairCohorts(na?.cohorts ?? [], nb?.cohorts ?? [], map, !!a);
}

export function buildComparisonRows(
  a: TrialAnswers | undefined,
  b: TrialAnswers | undefined,
  map?: CohortMap | null,
  added: AddedCohort[] = [],
): ComparisonRow[] {
  const both = !!a && !!b;
  const na = a && normalizeAnswers(a);
  const nb = b && normalizeAnswers(b);
  const out: ComparisonRow[] = [];

  // Rows compared after normalization; tags rows that agree only because of it.
  const push = (r: Omit<ComparisonRow, 'agree' | 'needsDecision' | 'autoReason'>, inherited = false) => {
    const agree = both && normValue(r.a) === normValue(r.b);
    let autoReason: AutoReason | undefined;
    if (r.oneSided) autoReason = 'one_sided';
    else if (agree && normValue(r.rawA) !== normValue(r.rawB)) autoReason = inherited ? 'inherited' : 'blank_rule';
    out.push({ ...r, agree, needsDecision: both && !agree && !r.oneSided, autoReason });
  };

  for (const [fk, def] of Object.entries(TRIAL_LEVEL_DEFS)) {
    const av = na ? get(na, fk) : null;
    const bv = nb ? get(nb, fk) : null;
    const rawA = get(a, fk);
    const rawB = get(b, fk);
    out.push({
      cohortKey: TRIAL_LEVEL_SENTINEL, cancerType: TRIAL_LEVEL_SENTINEL, scope: 'trial', fieldKey: fk, def,
      a: av, b: bv, rawA, rawB,
      agree: both && normValue(av) === normValue(bv),
      needsDecision: false,
      autoReason: both && normValue(rawA) !== normValue(rawB) ? 'derived' : undefined,
    });
  }

  const rawCohort = (src: TrialAnswers | undefined, c: Cohort | undefined) =>
    c && src?.cohorts.find((x) => x.cohortKey === c.cohortKey);

  for (const pair of pairCohorts(na?.cohorts ?? [], nb?.cohorts ?? [], map, !!a)) {
    const ca = pair.a;
    const cb = pair.b;
    const rca = rawCohort(a, ca);
    const rcb = rawCohort(b, cb);
    const cohortKey = pair.key;
    const cohortDisplayName = ca?.displayName || cb?.displayName || cohortKey;
    const cohortOneSided: 'a' | 'b' | undefined = both && (!ca || !cb) ? (ca ? 'a' : 'b') : undefined;
    const base = { cohortKey, cohortDisplayName };

    if (cohortOneSided) {
      out.push({
        ...base, cancerType: TRIAL_LEVEL_SENTINEL, scope: 'cohort_existence',
        fieldKey: COHORT_EXISTS_FIELD, def: COHORT_EXISTS_DEF,
        a: !!ca, b: !!cb, rawA: !!ca, rawB: !!cb,
        agree: false, needsDecision: true,
      });
    }

    const typesA = typesOf(ca);
    const typesB = typesOf(cb);
    push({
      ...base, cancerType: TRIAL_LEVEL_SENTINEL, scope: 'cohort', fieldKey: COHORT_TYPES_FIELD, def: COHORT_TYPES_DEF,
      a: typesA, b: typesB, rawA: typesA, rawB: typesB, oneSided: cohortOneSided,
    });

    for (const [fk, def] of Object.entries(COHORT_LEVEL_DEFS)) {
      const av = get(ca, fk);
      const bv = get(cb, fk);
      const rawA = get(rca, fk);
      const rawB = get(rcb, fk);
      push(
        { ...base, cancerType: TRIAL_LEVEL_SENTINEL, scope: 'cohort', fieldKey: fk, def, a: av, b: bv, rawA, rawB, oneSided: cohortOneSided },
        (rawA === null && av !== null) || (rawB === null && bv !== null),
      );
    }

    const types = ALL_CANCER_TYPES.filter((ct) => ca?.applicableCancerTypes?.[ct] || cb?.applicableCancerTypes?.[ct]);
    for (const ct of types) {
      const inA = !!ca?.applicableCancerTypes?.[ct];
      const inB = !!cb?.applicableCancerTypes?.[ct];
      const oneSided = cohortOneSided ?? (both && inA !== inB ? (inA ? 'a' : 'b') : undefined);
      for (const [fk, def] of Object.entries(BLOCKS[ct]?.fields ?? {})) {
        push({
          ...base, cancerType: ct, scope: 'descriptor', fieldKey: fk, def,
          a: get(ca?.applicableCancerTypes?.[ct], fk),
          b: get(cb?.applicableCancerTypes?.[ct], fk),
          rawA: get(rca?.applicableCancerTypes?.[ct], fk),
          rawB: get(rcb?.applicableCancerTypes?.[ct], fk),
          oneSided,
        });
      }
    }
  }

  for (const c of added) {
    const pushAdded = (cancerType: string, scope: ComparisonScope, fieldKey: string, def: FieldDef) => out.push({
      cohortKey: c.cohortKey, cohortDisplayName: c.displayName, cancerType, scope, fieldKey, def,
      a: null, b: null, rawA: null, rawB: null, agree: false, needsDecision: false, added: true,
    });
    pushAdded(TRIAL_LEVEL_SENTINEL, 'cohort', COHORT_TYPES_FIELD, COHORT_TYPES_DEF);
    for (const [fk, def] of Object.entries(COHORT_LEVEL_DEFS)) pushAdded(TRIAL_LEVEL_SENTINEL, 'cohort', fk, def);
    for (const ct of c.cancerTypes) {
      for (const [fk, def] of Object.entries(BLOCKS[ct]?.fields ?? {})) pushAdded(ct, 'descriptor', fk, def);
    }
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────
// Merge with reviewer decisions
// ──────────────────────────────────────────────────────────────────────────

export type FieldSource = 'adjudicated' | 'agreed' | 'single_annotator' | 'one_sided' | 'unresolved' | 'derived' | 'added';

export interface ResolvedRow extends ComparisonRow {
  value: FieldValue;
  source: FieldSource;
}

export interface ResolvedTrial {
  rows: ResolvedRow[];          // rows on the final label (dropped cohorts / types removed)
  trial: TrialLevel;
  cohorts: Cohort[];
  unresolved: ResolvedRow[];    // open decisions
  autoResolved: ResolvedRow[];  // rows that differ as entered but need no decision
}

// `decision(key)` returns the reviewer's value for an adjudicationKey, or
// undefined when nobody has decided. `added` must be the cohorts the rows were
// built with.
export function resolveRows(
  rows: ComparisonRow[],
  hasA: boolean,
  hasB: boolean,
  decision: (key: string) => FieldValue | undefined,
  added: AddedCohort[] = [],
): ResolvedTrial {
  const addedTypes = new Map(added.map((c) => [c.cohortKey, c.cancerTypes]));
  const resolved: ResolvedRow[] = rows.map((r) => {
    if (r.scope === 'trial') return { ...r, value: null, source: 'derived' };
    if (r.added && r.fieldKey === COHORT_TYPES_FIELD) {
      return { ...r, value: addedTypes.get(r.cohortKey) ?? null, source: 'added' };
    }
    const d = decision(adjudicationKey(r.cohortKey, r.cancerType, r.fieldKey));
    if (d !== undefined) return { ...r, value: normalizeFieldValue(r.cancerType, r.fieldKey, d), source: 'adjudicated' };
    if (r.added) return { ...r, value: null, source: 'added' };
    if (!hasA || !hasB) return { ...r, value: hasA ? r.a : r.b, source: 'single_annotator' };
    if (r.agree) return { ...r, value: r.a, source: 'agreed' };
    if (r.oneSided) return { ...r, value: r.oneSided === 'a' ? r.a : r.b, source: 'one_sided' };
    return { ...r, value: null, source: 'unresolved' };
  });

  // A cohort is dropped only when its existence was decided false; an
  // undecided existence keeps it (and stays open).
  const dropped = new Set(
    resolved.filter((r) => r.scope === 'cohort_existence' && r.value === false).map((r) => r.cohortKey),
  );
  // Cancer types on each cohort: the decided / agreed / one-sided set, or the
  // union of both annotators while the membership decision is open.
  const typesByCohort = new Map<string, Set<string>>();
  for (const r of resolved) {
    if (r.fieldKey !== COHORT_TYPES_FIELD) continue;
    const v = r.source === 'unresolved'
      ? [...((r.a as string[] | null) ?? []), ...((r.b as string[] | null) ?? [])]
      : ((r.value as string[] | null) ?? []);
    typesByCohort.set(r.cohortKey, new Set(v));
  }

  const kept = resolved.filter((r) => {
    if (r.scope === 'trial' || r.scope === 'cohort_existence') return true;
    if (dropped.has(r.cohortKey)) return false;
    if (r.scope === 'descriptor') return typesByCohort.get(r.cohortKey)?.has(r.cancerType) ?? false;
    return true;
  });

  const cohorts = new Map<string, Cohort>();
  for (const r of kept) {
    if (r.scope !== 'cohort' && r.scope !== 'descriptor') continue;
    let c = cohorts.get(r.cohortKey);
    if (!c) {
      c = {
        cohortKey: r.cohortKey, displayName: r.cohortDisplayName ?? '', applicableCancerTypes: {},
        minAge: null, maxAge: null, ecogMin: null, ecogMax: null,
      };
      for (const ct of typesByCohort.get(r.cohortKey) ?? []) c.applicableCancerTypes[ct as CancerType] = {};
      cohorts.set(r.cohortKey, c);
    }
    if (r.fieldKey === COHORT_TYPES_FIELD) continue;
    if (r.scope === 'cohort') {
      (c as unknown as Record<string, FieldValue>)[r.fieldKey] = r.value;
    } else {
      const block = c.applicableCancerTypes[r.cancerType as CancerType] ?? {};
      block[r.fieldKey] = r.value;
      c.applicableCancerTypes[r.cancerType as CancerType] = block;
    }
  }
  const finalCohorts = [...cohorts.values()];
  const trial = deriveTrialLevel(finalCohorts);
  for (const r of kept) {
    if (r.scope === 'trial') r.value = (trial as unknown as Record<string, FieldValue>)[r.fieldKey] ?? null;
  }

  return {
    rows: kept,
    trial,
    cohorts: finalCohorts,
    unresolved: kept.filter((r) => r.source === 'unresolved'),
    autoResolved: kept.filter((r) =>
      (r.source === 'agreed' && (r.autoReason === 'blank_rule' || r.autoReason === 'inherited')) ||
      (r.source === 'one_sided' && !isBlank(r.value)),
    ),
  };
}
