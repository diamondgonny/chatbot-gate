"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useCouncilSessionsContext } from "@/features/council";

/**
 * Council Index Page
 * Session이 선택되지 않았을 때 환영 메시지와 함께 empty state 표시
 * Sidebar는 layout component에서 렌더링됨
 */
export default function CouncilPage() {
  const router = useRouter();
  const { createSession, isCreating } = useCouncilSessionsContext();

  const handleNewSession = useCallback(async () => {
    const sessionId = await createSession();
    if (sessionId) {
      router.push(`/council/${sessionId}`);
    }
  }, [createSession, router]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-0 overflow-hidden">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center">
          <svg
            className="w-10 h-10 text-blue-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
        </div>
        <h2 className="text-2xl font-semibold text-slate-200 mb-2">
          AI Council
        </h2>
        <p className="text-slate-400 mb-6 max-w-md">
          Multiple AI models work together to answer your questions.
          <br />
          Get diverse perspectives and a synthesized final answer.
        </p>
        <button
          onClick={handleNewSession}
          disabled={isCreating}
          className={`px-6 py-3 bg-blue-600 text-white rounded-lg transition-colors flex items-center gap-2 mx-auto cursor-pointer ${
            isCreating ? "opacity-50" : "hover:bg-blue-500"
          }`}
        >
          <svg
            className="w-5 h-5"
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
          Start New Council
        </button>
      </motion.div>
    </div>
  );
}
