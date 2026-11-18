import Link from 'next/link';
import { redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';
import { AppHeader } from '@/components/AppHeader';
import { loadCorpus, mergeAdjudicated } from '@/lib/labels-export';

export const dynamic = 'force-dynamic';

export default async function ExportPage() {
  const session = await readSession();
  if (!session) redirect('/login');
  if (session.role !== 'reviewer') redirect('/expert');

  const trials = await loadCorpus();
  const a1 = trials.filter((t) => t.annotator1).length;
  const a2 = trials.filter((t) => t.annotator2).length;
  const bothIn = trials.filter((t) => t.annotator1 && t.annotator2);
  let fullyResolved = 0;
  let trialsWithAdjudication = 0;
  let unresolvedFields = 0;
  for (const t of bothIn) {
    const merged = mergeAdjudicated(t);
    const open = merged?.unresolved.length ?? 0;
    unresolvedFields += open;
    if (open === 0) fullyResolved++;
    if (t.adjudications.size > 0) trialsWithAdjudication++;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader name={session.name} role={session.role} />
      <main className="max-w-3xl mx-auto px-6 py-10">
        <Link href="/review" className="text-sm text-blue-600 hover:underline">← Reviewer dashboard</Link>
        <div className="mt-3 mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Export labels</h1>
          <p className="text-sm text-slate-600 mt-1">
            Download labels for the main corpus ({trials.length} trials). Only submitted annotations are included.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <Stat label="Annotator 1 submitted" value={`${a1} / ${trials.length}`} />
          <Stat label="Annotator 2 submitted" value={`${a2} / ${trials.length}`} />
          <Stat label="Adjudication started" value={`${trialsWithAdjudication} / ${bothIn.length}`} />
          <Stat
            label="No open disagreements"
            value={`${fullyResolved} / ${bothIn.length}`}
            hint={unresolvedFields > 0 ? `${unresolvedFields} fields still unresolved` : undefined}
          />
        </div>

        <form
          action="/api/export/labels"
          method="get"
          className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm shadow-blue-100/30 space-y-6"
        >
          <fieldset>
            <legend className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3">Labels from</legend>
            <div className="space-y-2">
              <Choice
                name="source" value="annotator1" defaultChecked
                title="Annotator 1"
                body="The expert holding the trial's first annotator slot, exactly as they submitted."
              />
              <Choice
                name="source" value="annotator2"
                title="Annotator 2"
                body="The expert holding the trial's second annotator slot, exactly as they submitted."
              />
              <Choice
                name="source" value="adjudicated"
                title="Adjudicated"
                body="Your decision where one exists, otherwise the value both annotators agreed on. Disagreements you haven't decided yet are left blank and marked unresolved. Both annotators' values are included alongside."
              />
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3">Format</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Choice
                name="format" value="csv" defaultChecked
                title="CSV"
                body="One row per field. Opens in Excel or pandas."
              />
              <Choice
                name="format" value="json"
                title="JSON"
                body="One nested record per trial, with cohorts and cancer-type blocks."
              />
            </div>
          </fieldset>

          <button
            type="submit"
            className="w-full px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition shadow-sm shadow-blue-200"
          >
            Download
          </button>
        </form>

        <section className="mt-10">
          <h2 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3">Test trials</h2>
          <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
            <ExportLink
              href="/api/export/attempts"
              title="Expert annotations vs reference key (CSV)"
              body="One row per field for every annotation, compared with your reference key."
            />
            <ExportLink
              href="/api/export/scores"
              title="Expert scores (CSV)"
              body="Per-expert F1 on each test trial."
            />
          </div>
        </section>
      </main>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="text-lg font-bold text-slate-900 mt-0.5">{value}</div>
      {hint && <div className="text-[11px] text-amber-700 mt-0.5">{hint}</div>}
    </div>
  );
}

function Choice({
  name, value, title, body, defaultChecked,
}: { name: string; value: string; title: string; body: string; defaultChecked?: boolean }) {
  return (
    <label className="flex gap-3 items-start border border-slate-200 rounded-xl p-3 cursor-pointer hover:border-blue-300 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
      <input type="radio" name={name} value={value} defaultChecked={defaultChecked} className="mt-1 accent-blue-600" />
      <span>
        <span className="block text-sm font-semibold text-slate-900">{title}</span>
        <span className="block text-xs text-slate-600 mt-0.5 leading-relaxed">{body}</span>
      </span>
    </label>
  );
}

function ExportLink({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <a href={href} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-blue-50 transition">
      <span>
        <span className="block text-sm font-medium text-slate-900">{title}</span>
        <span className="block text-xs text-slate-500 mt-0.5">{body}</span>
      </span>
      <span className="text-sm text-blue-600 whitespace-nowrap">Download ↓</span>
    </a>
  );
}
