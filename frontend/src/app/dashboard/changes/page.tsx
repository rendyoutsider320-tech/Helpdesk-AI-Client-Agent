
export default function ChangesPage() {
  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white tracking-tight">CHANGES</h1>
      </div>
      <div className="rounded-[24px] border border-white/5 bg-slate-900/50 p-12 shadow-2xl backdrop-blur-xl text-center">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-400 mb-6">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
        </div>
        <h3 className="text-xl font-medium text-white mb-2">Module Under Construction</h3>
        <p className="text-slate-400 max-w-md mx-auto">This enterprise module is currently being finalized and will be available in the next deployment phase.</p>
        <button className="mt-8 px-6 py-2 bg-sky-500/20 text-sky-400 rounded-lg hover:bg-sky-500/30 transition-colors font-medium">Return to Dashboard</button>
      </div>
    </div>
  );
}
