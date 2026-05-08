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
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white border border-gray-200 rounded-xl shadow-sm p-8">
        <h1 className="text-2xl font-semibold mb-1">Clinical Trial Review</h1>
        <p className="text-sm text-gray-500 mb-6">Select a reviewer to begin.</p>

        {loading ? (
          <div className="text-sm text-gray-500">Loading…</div>
        ) : (
          <>
            <div className="space-y-2 mb-6">
              {users.length === 0 ? (
                <div className="text-sm text-gray-500">No reviewers yet — create one below.</div>
              ) : (
                users.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => pick(u)}
                    className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition"
                  >
                    <div className="font-medium">{u.name}</div>
                  </button>
                ))
              )}
            </div>

            <div className="border-t border-gray-200 pt-5">
              <label className="block text-xs uppercase tracking-wide text-gray-500 mb-2">
                Create new reviewer
              </label>
              <div className="flex gap-2">
                <input
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && createUser()}
                />
                <button
                  onClick={createUser}
                  disabled={creating || !newName.trim()}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md disabled:opacity-50 hover:bg-blue-700"
                >
                  Create
                </button>
              </div>
              {error && <div className="text-sm text-red-600 mt-2">{error}</div>}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
