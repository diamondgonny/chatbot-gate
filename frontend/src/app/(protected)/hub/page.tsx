"use client";

import Link from "next/link";

export default function Hub() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 p-4">
      <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-slate-200 to-slate-400">
        The Hub
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
        <Link
          href="/chat"
          className="group relative p-8 bg-slate-800/50 border border-slate-700 rounded-2xl hover:bg-slate-800 transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-blue-900/20"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
          <h2 className="text-2xl font-semibold text-slate-200 mb-2">
            AI Chat
          </h2>
          <p className="text-slate-400">Talk to our AI, your travel friend.</p>
        </Link>

        <Link
          href="/council"
          className="group relative p-8 bg-slate-800/50 border border-slate-700 rounded-2xl hover:bg-slate-800 transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-purple-900/20"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
          <h2 className="text-2xl font-semibold text-slate-200 mb-2">
            AI Council
          </h2>
          <p className="text-slate-400">
            Multiple AIs collaborate to answer your questions.
          </p>
        </Link>
      </div>
    </div>
  );
}
