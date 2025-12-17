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
 * Council context를 사용하는 내부 component
 */
function CouncilSessionContent() {
  const params = useParams();
  const sessionId = params.sessionId as string;

  const { loadSession, stage3Synthesis, isProcessing } = useCouncilContext();
  const { startAlert } = useTitleAlert();
  const prevProcessingRef = useRef(isProcessing);

  // Mount 시 또는 sessionId 변경 시 session 로드
  // Navigation 중 이전 session content가 깜빡이는 것을 방지하기 위해 useLayoutEffect 사용
  useLayoutEffect(() => {
    if (sessionId) {
      loadSession(sessionId);
    }
  }, [sessionId, loadSession]);

  // Stage 3 완료 시 사용자에게 알림 (tab title 깜빡임)
  useEffect(() => {
    // stage3Synthesis가 있는 상태에서 isProcessing이 true에서 false로 전환되는 시점 감지
    if (prevProcessingRef.current && !isProcessing && stage3Synthesis) {
      if (document.hidden) {
        startAlert("📜 Council 완료!");
      }
    }
    prevProcessingRef.current = isProcessing;
  }, [isProcessing, stage3Synthesis, startAlert]);

  return (
    <>
      {/* Message 영역 */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-custom min-h-0">
        <MessageList />
      </div>

      {/* Input 영역 */}
      <InputArea sessionId={sessionId} />
    </>
  );
}

/**
 * CouncilProvider로 감싼 page component
 * Session content만 감싸고 sidebar는 제외 (sidebar는 layout에 있음)
 */
export default function CouncilSessionPage() {
  return (
    <CouncilProvider>
      <CouncilSessionContent />
    </CouncilProvider>
  );
}
