"use client";

import { formatTimeAgo } from "@/lib/timeUtils";
import { motion } from "framer-motion";

interface Session {
  sessionId: string;
  title: string;
  lastMessage: {
    content: string;
    role: string;
    timestamp: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

interface SessionSidebarProps {
  sessions?: Session[];
  currentSessionId?: string;
  onSessionSelect?: (sessionId: string) => void;
  onDeleteSession?: (sessionId: string) => void;
  onNewChat?: () => void;
  loading?: boolean;
}

export default function SessionSidebar({
  sessions = [],
  currentSessionId,
  onSessionSelect,
  onDeleteSession,
  onNewChat,
  loading = false,
}: SessionSidebarProps) {
  if (loading) {
    return (
      <div className="w-64 bg-slate-900/50 border-r border-slate-800 p-4">
        <div className="text-slate-500 text-sm">Loading sessions...</div>
      </div>
    );
  }

  return (
    <div className="w-64 bg-slate-900/50 border-r border-slate-800 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 min-h-[88px] flex items-center">
        <button
          onClick={onNewChat}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2 px-4 rounded-lg transition-colors text-sm font-medium"
        >
          + 새 채팅
        </button>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto p-2 divide-y divide-slate-800/60 scrollbar-custom">
        {sessions.length === 0 ? (
          <div className="text-slate-500 text-sm p-4 text-center">
            아직 채팅이 없습니다
          </div>
        ) : (
          sessions.map((session) => (
            <motion.div
              key={session.sessionId}
              className={`relative group w-full text-left px-3 py-3 rounded-lg transition-colors ${
                currentSessionId === session.sessionId
                  ? "bg-slate-800 border border-slate-700"
                  : "hover:bg-slate-800/50"
              }`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <button
                onClick={() => onSessionSelect?.(session.sessionId)}
                className="w-full text-left"
              >
                <h3 className="text-slate-200 text-sm font-medium truncate mb-1 pr-8">
                  {session.lastMessage?.content || session.title}
                </h3>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="capitalize">
                    {session.lastMessage?.role === "ai" ? "" : ""}
                  </span>
                  <span>{formatTimeAgo(session.updatedAt)}</span>
                </div>
              </button>

              {/* Delete Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteSession?.(session.sessionId);
                }}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-600 rounded text-slate-400 hover:text-white"
                title="Delete session"
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
          ))
        )}
      </div>
    </div>
  );
}
