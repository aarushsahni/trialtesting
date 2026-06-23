// Render the raw CT.gov fields for one trial. Used by both the expert
// annotation editor and the reviewer reference-key editor. Pure presentation —
// no edit/save state.

import { EligibilityText } from './EligibilityText';

export interface RawTrial {
  nctId: string;
  briefTitle: string;
  briefSummary: string | null;
  detailedDescription: string | null;
  eligibilityRaw: string | null;
  conditions: string[];
  interventions: string[];
  overallStatus: string | null;
  studyType: string | null;
  phases: string[] | null;
  ctgovSex: string | null;
  ctgovMinAge: string | null;
  ctgovMaxAge: string | null;
}

export function RawTrialPanel({ trial }: { trial: RawTrial }) {
  const isPlaceholder = trial.nctId.startsWith('TRIAL-');
  const phaseStatusItems = [
    ...(trial.phases ?? []),
    ...(trial.overallStatus ? [trial.overallStatus] : []),
  ];

  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm shadow-blue-100/30 overflow-hidden">
      <header className="px-6 py-3 border-b border-slate-100">
        <h2 className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
          Raw CT.gov data
        </h2>
      </header>
      <div className="px-6 py-5 space-y-5">
        <Block label="NCT">
          {isPlaceholder ? (
            <span className="font-mono text-sm text-slate-700">{trial.nctId}</span>
          ) : (
            <a
              href={`https://clinicaltrials.gov/study/${trial.nctId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-sm text-blue-600 hover:underline"
            >
              {trial.nctId}
            </a>
          )}
        </Block>

        <Block label="Brief title">
          <p className="text-sm text-slate-900 leading-relaxed">{trial.briefTitle}</p>
        </Block>

        {phaseStatusItems.length > 0 && (
          <Block label="Phase / status">
            <ChipRow items={phaseStatusItems} />
          </Block>
        )}

        {trial.conditions.length > 0 && (
          <Block label="Conditions">
            <ChipRow items={trial.conditions} />
          </Block>
        )}

        {trial.interventions.length > 0 && (
          <Block label="Interventions">
            <ChipRow items={trial.interventions} />
          </Block>
        )}

        {(trial.studyType || trial.ctgovSex || trial.ctgovMinAge || trial.ctgovMaxAge) && (
          <Block label="Study metadata">
            <dl className="text-xs text-slate-700 grid grid-cols-2 gap-x-4 gap-y-1.5">
              <Meta k="Study type" v={trial.studyType} />
              <Meta k="Sex" v={trial.ctgovSex} />
              <Meta k="Min age" v={trial.ctgovMinAge} />
              <Meta k="Max age" v={trial.ctgovMaxAge} />
            </dl>
          </Block>
        )}

        {trial.briefSummary && (
          <Block label="Brief summary">
            <p className="text-sm text-slate-900 leading-relaxed whitespace-pre-line">
              {trial.briefSummary}
            </p>
          </Block>
        )}

        {trial.detailedDescription && (
          <Block label="Detailed description">
            <p className="text-sm text-slate-900 leading-relaxed whitespace-pre-line">
              {trial.detailedDescription}
            </p>
          </Block>
        )}

        <Block label="Eligibility criteria (raw)">
          <EligibilityText raw={trial.eligibilityRaw || ''} />
        </Block>
      </div>
    </section>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-2">
        {label}
      </div>
      {children}
    </div>
  );
}

function ChipRow({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((c, i) => (
        <span
          key={`${c}-${i}`}
          className="text-xs px-2 py-1 bg-slate-100 text-slate-700 rounded-md font-medium border border-slate-200"
        >
          {c}
        </span>
      ))}
    </div>
  );
}

function Meta({ k, v }: { k: string; v: string | undefined | null }) {
  return (
    <>
      <dt className="text-slate-500">{k}</dt>
      <dd className="text-slate-800">{v || '—'}</dd>
    </>
  );
}
