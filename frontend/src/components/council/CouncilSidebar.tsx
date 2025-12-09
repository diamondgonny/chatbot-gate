"use client";

import { motion } from "framer-motion";
import type { CouncilSession } from "@/types";

interface CouncilSidebarProps {
  sessions: CouncilSession[];
  currentSessionId: string | null;
  isLoading: boolean;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  onDeleteSession: (sessionId: string) => void;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

export function CouncilSidebar({
  sessions,
  currentSessionId,
  isLoading,
  onSelectSession,
  onNewSession,
  onDeleteSession,
}: CouncilSidebarProps) {
  return (
    <div className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-slate-800">
        <button
          onClick={onNewSession}
          className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          New Council
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-slate-500">
            <span className="animate-spin mr-2">⏳</span> Loading...
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-sm">
            No sessions yet.
            <br />
            Start a new council!
          </div>
        ) : (
          <div className="space-y-1">
            {sessions.map((session) => (
              <motion.div
                key={session.sessionId}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className={`group relative rounded-lg transition-colors ${
                  currentSessionId === session.sessionId
                    ? "bg-slate-700"
                    : "hover:bg-slate-800"
                }`}
              >
                <button
                  onClick={() => onSelectSession(session.sessionId)}
                  className="w-full text-left p-3"
                >
                  <div className="text-sm text-slate-200 truncate pr-6">
                    {session.title}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {formatDate(session.updatedAt)}
                  </div>
                </button>

                {/* Delete button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSession(session.sessionId);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-slate-500 hover:text-red-400 hover:bg-slate-700 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Delete session"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-slate-800">
        <a
          href="/hub"
          className="flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors text-sm"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
          Back to Hub
        </a>
      </div>
    </div>
  );
}
