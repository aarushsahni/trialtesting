export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-sky-50 flex items-center justify-center p-6">
      <div className="max-w-md text-center">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 mx-auto flex items-center justify-center text-white font-bold text-xl shadow-sm mb-6">
          Q
        </div>
        <h1 className="text-3xl font-bold text-slate-900 mb-3">
          Qualification phase — setup in progress
        </h1>
        <p className="text-slate-600 leading-relaxed">
          A new evaluation flow is being built here. The platform is being rebuilt
          against the v2 schema and the dual-role (annotator / reviewer) workflow.
        </p>
        <p className="text-sm text-slate-400 mt-6">
          Sign-in coming next.
        </p>
      </div>
    </div>
  );
}
