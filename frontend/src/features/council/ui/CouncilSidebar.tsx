"use client";

import { memo, useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { CouncilSession } from "../domain";
import { formatTimeAgo } from "@/shared/utils";

/**
 * Memoized session item component
 * Only re-renders when its own props change
 */
interface SessionItemProps {
  session: CouncilSession;
  isSelected: boolean;
  onSelect: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
}

const SessionItem = memo(
  function SessionItem({ session, isSelected, onSelect, onDelete }: SessionItemProps) {
    const [showTooltip, setShowTooltip] = useState(false);
    const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const handleMouseEnter = useCallback(() => {
      hoverTimeoutRef.current = setTimeout(() => {
        setShowTooltip(true);
      }, 1000);
    }, []);

    const handleMouseLeave = useCallback(() => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      setShowTooltip(false);
    }, []);

    useEffect(() => {
      return () => {
        if (hoverTimeoutRef.current) {
          clearTimeout(hoverTimeoutRef.current);
        }
      };
    }, []);

    const handleSelect = useCallback(() => {
      onSelect(session.sessionId);
    }, [onSelect, session.sessionId]);

    const handleDelete = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        onDelete(session.sessionId);
      },
      [onDelete, session.sessionId]
    );

    return (
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        className={`group relative rounded-lg transition-colors ${
          isSelected ? "bg-slate-700" : "hover:bg-slate-800"
        }`}
      >
        {/* Tooltip - appears after 1 second of hover */}
        <AnimatePresence>
          {showTooltip && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute top-full left-0 mt-1 bg-slate-800 text-slate-100 text-xs px-3 py-2 rounded-lg whitespace-normal max-w-xs z-50 border border-slate-600 shadow-lg"
            >
              {session.title}
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={handleSelect}
          className="w-full text-left px-3 py-3 cursor-pointer"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <h3 className="text-slate-200 text-sm font-medium mb-1 pr-4 truncate">
            {session.title}
          </h3>
          <div className="text-xs text-slate-500">{formatTimeAgo(session.updatedAt)}</div>
        </button>

        {/* Delete button */}
        <button
          onClick={handleDelete}
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
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison: only re-render if these specific props change
    return (
      prevProps.session.sessionId === nextProps.session.sessionId &&
      prevProps.session.title === nextProps.session.title &&
      prevProps.session.updatedAt === nextProps.session.updatedAt &&
      prevProps.isSelected === nextProps.isSelected &&
      prevProps.onSelect === nextProps.onSelect &&
      prevProps.onDelete === nextProps.onDelete
    );
  }
);

interface CouncilSidebarProps {
  sessions: CouncilSession[];
  currentSessionId: string | null;
  isLoading: boolean;
  isCreating: boolean;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  onDeleteSession: (sessionId: string) => void;
}

export function CouncilSidebar({
  sessions,
  currentSessionId,
  isLoading,
  isCreating,
  onSelectSession,
  onNewSession,
  onDeleteSession,
}: CouncilSidebarProps) {

  return (
    <div className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-full min-h-0 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 min-h-[88px] flex items-center">
        <button
          onClick={onNewSession}
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
          New Council
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto py-2 pl-2 pr-2 scrollbar-custom">
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
          <div>
            {sessions.map((session) => (
              <SessionItem
                key={session.sessionId}
                session={session}
                isSelected={currentSessionId === session.sessionId}
                onSelect={onSelectSession}
                onDelete={onDeleteSession}
              />
            ))}
          </div>
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
