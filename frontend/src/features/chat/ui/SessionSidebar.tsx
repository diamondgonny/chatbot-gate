"use client";

import { formatTimeAgo } from "../utils";
import { motion } from "framer-motion";
import type { Session } from "../domain";

interface SessionSidebarProps {
  sessions?: Session[];
  currentSessionId?: string;
  onSessionSelect?: (sessionId: string) => void;
  onDeleteSession?: (sessionId: string) => void;
  onNewChat?: () => void;
  loading?: boolean;
  loadingSessionId?: string;
  isCreating?: boolean;
}

export default function SessionSidebar({
  sessions = [],
  currentSessionId,
  onSessionSelect,
  onDeleteSession,
  onNewChat,
  loading = false,
  loadingSessionId,
  isCreating = false,
}: SessionSidebarProps) {
  if (loading) {
    return (
      <div className="w-64 bg-slate-900/50 border-r border-slate-800 p-4">
        <div className="text-slate-500 text-sm">Loading sessions...</div>
      </div>
    );
  }

  return (
    <div className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-full min-h-0 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 min-h-[88px] flex items-center">
        <button
          onClick={onNewChat}
          disabled={isCreating}
          className={`w-full py-2 px-4 bg-blue-600 text-white rounded-lg transition-colors flex items-center justify-center gap-2 text-sm font-medium cursor-pointer ${
            isCreating ? "opacity-50" : "hover:bg-blue-500"
          }`}
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
          New Chat
        </button>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto py-2 pl-2 pr-2 scrollbar-custom">
        {sessions.length === 0 ? (
          <div className="text-slate-500 text-sm p-4 text-center">
            No sessions yet.
            <br />
            Start a new chat!
          </div>
        ) : (
          sessions.map((session) => {
            const isActive = currentSessionId === session.sessionId;
            const isLoading = loadingSessionId === session.sessionId;

            return (
              <motion.div
                key={session.sessionId}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className={`relative group w-full text-left rounded-lg transition-colors cursor-pointer ${
                  isActive ? "bg-slate-700" : "hover:bg-slate-800"
                } ${isLoading ? "opacity-50 cursor-wait" : ""}`}
              >
                <button
                  onClick={() => onSessionSelect?.(session.sessionId)}
                  className="w-full text-left px-3 py-3 cursor-pointer"
                  disabled={isLoading}
                >
                  <h3 className="text-slate-200 text-sm font-medium mb-1 pr-4 flex items-center gap-2">
                    <span className="truncate">
                      {session.lastMessage?.content || session.title}
                    </span>
                    {isLoading && (
                      <span className="flex-shrink-0 inline-block animate-spin text-blue-400">
                        ⟳
                      </span>
                    )}
                  </h3>
                  <div className="text-xs text-slate-500">{formatTimeAgo(session.updatedAt)}</div>
                </button>

                {/* Delete Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSession?.(session.sessionId);
                  }}
                  className="cursor-pointer absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-slate-500 hover:text-red-400 hover:bg-slate-700 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Delete session"
                  disabled={isLoading}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
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
            );
          })
        )}
      </div>

      {/* Footer - height matches input area */}
      <div className="px-4 py-[30px] border-t border-slate-800">
        <a
          href="/hub"
          className="flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors text-sm w-3/5 -my-3 py-3"
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
