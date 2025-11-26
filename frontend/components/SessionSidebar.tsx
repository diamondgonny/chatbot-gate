"use client";

import { useEffect, useState } from "react";
import { formatTimeAgo } from "@/lib/timeUtils";
import axios from "axios";
import { motion } from "framer-motion";

interface Session {
  sessionId: string;
  title: string;
  messageCount: number;
  lastMessage: {
    content: string;
    role: string;
    timestamp: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

interface SessionSidebarProps {
  currentSessionId?: string;
  onSessionSelect?: (sessionId: string) => void;
  onNewChat?: () => void;
}

export default function SessionSidebar({
  currentSessionId,
  onSessionSelect,
  onNewChat,
}: SessionSidebarProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      const response = await axios.get("http://localhost:4000/api/sessions", {
        withCredentials: true,
      });
      setSessions(response.data.sessions || []);
    } catch (error) {
      console.error("Error loading sessions:", error);
    } finally {
      setLoading(false);
    }
  };

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
      <div className="p-4 border-b border-slate-800">
        <button
          onClick={onNewChat}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2 px-4 rounded-lg transition-colors text-sm font-medium"
        >
          + 새 채팅
        </button>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto p-2">
        {sessions.length === 0 ? (
          <div className="text-slate-500 text-sm p-4 text-center">
            아직 채팅이 없습니다
          </div>
        ) : (
          sessions.map((session) => (
            <motion.button
              key={session.sessionId}
              onClick={() => onSessionSelect?.(session.sessionId)}
              className={`w-full text-left p-3 rounded-lg mb-2 transition-colors ${
                currentSessionId === session.sessionId
                  ? "bg-slate-800 border border-slate-700"
                  : "hover:bg-slate-800/50"
              }`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <h3 className="text-slate-200 text-sm font-medium truncate mb-1">
                {session.title}
              </h3>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{session.messageCount} messages</span>
                <span>{formatTimeAgo(session.updatedAt)}</span>
              </div>
            </motion.button>
          ))
        )}
      </div>
    </div>
  );
}
