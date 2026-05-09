'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface User { id: string; name: string }

export default function HomePage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch('/api/users')
      .then((r) => r.json())
      .then((d) => setUsers(d.users ?? []))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  async function createUser() {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const r = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error ?? 'failed');
      } else {
        setUsers((u) => [...u, d.user]);
        setNewName('');
      }
    } finally {
      setCreating(false);
    }
  }

  function pick(u: User) {
    router.push(`/review/${u.id}`);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-sky-50">
      {/* Header */}
      <header className="border-b border-blue-100 bg-white/70 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold shadow-sm">
            C
          </div>
          <div>
            <h1 className="text-base font-semibold text-slate-900 leading-tight">
              Clinical Trial Extraction Review
            </h1>
            <p className="text-xs text-slate-500 leading-tight">
              Evaluating structured data from clinicaltrials.gov
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12 lg:py-20">
        {/* Hero */}
        <section className="text-center mb-16">
          <span className="inline-block text-xs uppercase tracking-wider text-blue-700 bg-blue-100 px-3 py-1 rounded-full font-semibold mb-4">
            Reviewer task
          </span>
          <h2 className="text-3xl lg:text-5xl font-bold text-slate-900 leading-tight mb-4">
            Help evaluate the extraction tool
          </h2>
          <p className="text-base lg:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
            For each clinical trial, an LLM has extracted structured eligibility fields.
            Read the trial on the left, then approve, edit, or null each extracted field on the right.
          </p>
        </section>

        {/* How it works */}
        <section className="mb-16">
          <h3 className="text-sm uppercase tracking-wider text-slate-500 font-semibold mb-6 text-center">
            How it works
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Step
              n={1}
              title="Pick or create a reviewer"
              body="Your progress is tracked per reviewer, so you can come back later or split the work between people."
            />
            <Step
              n={2}
              title="Choose a trial"
              body="Trials are grouped by cancer type — 5 trials per type, 105 total. Green dot = done, amber = in-progress."
            />
            <Step
              n={3}
              title="Approve or edit each field"
              body="The trial text is on the left. Each LLM-extracted field on the right has a checkbox to approve, or you can change the value inline."
            />
          </div>
          <div className="mt-6 max-w-3xl mx-auto bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 text-sm text-blue-900 flex gap-3">
            <span className="text-blue-600 mt-0.5">💡</span>
            <span>
              Edits auto-save every ~1 second. Click <strong>"Mark done & next"</strong> when finished
              with a trial to advance. Use <strong>"Approve all"</strong> on a section to bulk-approve
              when the LLM got everything right.
            </span>
          </div>
        </section>

        {/* Sign in */}
        <section className="max-w-md mx-auto">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm shadow-blue-100/40 p-7">
            <div className="flex items-baseline justify-between mb-5">
              <h3 className="text-lg font-semibold text-slate-900">Get started</h3>
              <span className="text-xs text-slate-400">
                {users.length} {users.length === 1 ? 'reviewer' : 'reviewers'}
              </span>
            </div>

            {loading ? (
              <div className="text-sm text-slate-500 py-6 text-center">Loading…</div>
            ) : (
              <>
                {users.length > 0 && (
                  <div className="space-y-2 mb-5">
                    <label className="block text-xs uppercase tracking-wider text-slate-500 font-semibold">
                      Continue as
                    </label>
                    {users.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => pick(u)}
                        className="group w-full text-left px-4 py-3 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50 transition flex items-center justify-between"
                      >
                        <span className="font-medium text-slate-900">{u.name}</span>
                        <span className="text-blue-600 opacity-0 group-hover:opacity-100 transition text-sm">
                          →
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                <div className={users.length > 0 ? 'border-t border-slate-200 pt-5' : ''}>
                  <label className="block text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">
                    {users.length > 0 ? 'Or create a new reviewer' : 'Create a reviewer'}
                  </label>
                  <div className="flex gap-2">
                    <input
                      className="flex-1 px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Your name"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && createUser()}
                    />
                    <button
                      onClick={createUser}
                      disabled={creating || !newName.trim()}
                      className="px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 transition shadow-sm shadow-blue-200"
                    >
                      Create
                    </button>
                  </div>
                  {error && <div className="text-sm text-red-600 mt-2">{error}</div>}
                </div>
              </>
            )}
          </div>

          <p className="text-xs text-slate-400 text-center mt-4">
            Reviews are saved per reviewer in a Postgres database — close the tab any time and pick up where you left off.
          </p>
        </section>
      </main>
    </div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm shadow-blue-100/30 hover:border-blue-300 transition">
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 text-white flex items-center justify-center text-sm font-bold mb-4">
        {n}
      </div>
      <h4 className="font-semibold text-slate-900 mb-2">{title}</h4>
      <p className="text-sm text-slate-600 leading-relaxed">{body}</p>
    </div>
  );
}
