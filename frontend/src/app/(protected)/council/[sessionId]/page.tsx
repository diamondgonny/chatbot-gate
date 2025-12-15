"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useParams } from "next/navigation";
import {
  CouncilProvider,
  useCouncilContext,
  MessageList,
  InputArea,
  useTitleAlert,
} from "@/features/council";

/**
 * Inner component that uses the council context
 */
function CouncilSessionContent() {
  const params = useParams();
  const sessionId = params.sessionId as string;

  const { loadSession, stage3Synthesis, isProcessing } = useCouncilContext();
  const { startAlert } = useTitleAlert();
  const prevProcessingRef = useRef(isProcessing);

  // Load session on mount or sessionId change
  // Using useLayoutEffect to prevent flash of previous session content during navigation
  useLayoutEffect(() => {
    if (sessionId) {
      loadSession(sessionId);
    }
  }, [sessionId, loadSession]);

  // Notify user when Stage 3 completes (tab title flash)
  useEffect(() => {
    // Detect when isProcessing transitions from true to false with stage3Synthesis present
    if (prevProcessingRef.current && !isProcessing && stage3Synthesis) {
      if (document.hidden) {
        startAlert("📜 Council 완료!");
      }
    }
    prevProcessingRef.current = isProcessing;
  }, [isProcessing, stage3Synthesis, startAlert]);

  return (
    <>
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-custom min-h-0">
        <MessageList />
      </div>

      {/* Input area */}
      <InputArea sessionId={sessionId} />
    </>
  );
}

/**
 * Page component wrapped with CouncilProvider
 * Only wraps the session content, not the sidebar (which is in layout)
 */
export default function CouncilSessionPage() {
  return (
    <CouncilProvider>
      <CouncilSessionContent />
    </CouncilProvider>
  );
}
