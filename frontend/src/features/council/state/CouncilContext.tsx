/**
 * 모든 하위 component에 council state와 action을 제공
 *
 * Render 최적화를 위해 분리된 context를 사용:
 * - CouncilMessagesContext: message
 * - CouncilStreamContext: stream state
 * - CouncilStatusContext: status flag
 */

"use client";

import {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  type ReactNode,
} from "react";
import type { CouncilMessage, CouncilAssistantMessage, CouncilMode } from "../domain";
import type { CurrentStage } from "../domain";
import type { CouncilState } from "./useCouncilState";
import { useCouncilStream } from "./useCouncilStream";
import {
  getCouncilSession,
  getProcessingStatus,
  abortCouncilProcessing,
} from "../services";
import { useCouncilMessagesContext } from "./CouncilMessagesContext";
import { useCouncilStreamContext } from "./CouncilStreamContext";
import { useCouncilStatusContext } from "./CouncilStatusContext";
import { useCouncilSessionsContext } from "./CouncilSessionsContext";

// DOM abort와 axios 취소를 모두 무해한 것으로 처리
function isAbortError(error: unknown): boolean {
  if (error instanceof Error) {
    if (error.name === "AbortError" || error.name === "CanceledError") {
      return true;
    }
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ERR_CANCELED"
  ) {
    return true;
  }

  return false;
}

export interface CouncilContextValue extends CouncilState {
  // Session action
  loadSession: (sessionId: string) => Promise<void>;
  sendMessage: (
    sessionId: string,
    content: string,
    mode?: CouncilMode,
    onComplete?: () => void
  ) => void;
  abortProcessing: (sessionId: string) => Promise<void>;
  clearError: () => void;
  setInputExpanded: (isExpanded: boolean) => void;
}

// Provider 내에서 사용되어야 함 (undefined 기본값으로 context 생성)
const CouncilContext = createContext<CouncilContextValue | undefined>(
  undefined
);

interface CouncilProviderProps {
  children: ReactNode;
}

/**
 * Council state와 action으로 children을 래핑
 *
 * 다음 내부에 중첩되어야 함:
 * - CouncilMessagesProvider
 * - CouncilStreamProvider
 * - CouncilStatusProvider
 */
export function CouncilProvider({ children }: CouncilProviderProps) {
  // Render 최적화를 위해 분리된 context 사용
  const messagesContext = useCouncilMessagesContext();
  const streamContext = useCouncilStreamContext();
  const statusContext = useCouncilStatusContext();
  const { updateSessionTitle, updateSessionTimestamp } = useCouncilSessionsContext();

  // Race condition 방지를 위해 현재 session 추적
  const loadSessionIdRef = useRef<string | null>(null);
  const loadAbortControllerRef = useRef<AbortController | null>(null);

  // title_complete event용 onComplete callback 저장
  const onCompleteCallbackRef = useRef<(() => void) | undefined>(undefined);

  // Dependency 문제 방지를 위해 split context에서 안정적인 setter 추출
  const { setMessages, setPendingMessage } = messagesContext;
  const { updateStreamState, resetStreamState } = streamContext;
  const {
    setProcessing,
    setReconnecting,
    setAborted,
    setLoading,
    setError,
    setInputExpanded,
  } = statusContext;

  // 안정적인 setter reference를 사용하여 stream callback 생성
  const streamCallbacks = useMemo(
    () => ({
      onStateChange: updateStreamState,
      onUserMessageConfirmed: (content: string) => {
        const userMessage: CouncilMessage = {
          role: "user",
          content,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, userMessage]);
        setPendingMessage(null);
      },
      onComplete: (assistantMessage: CouncilAssistantMessage) => {
        setMessages((prev) => [...prev, assistantMessage]);
        setPendingMessage(null); // Pending message 제거 (재연결 경우 포함)
        // 최신순 정렬을 위해 session timestamp 업데이트
        const sessionId = loadSessionIdRef.current;
        if (sessionId) {
          updateSessionTimestamp(sessionId);
        }
        onCompleteCallbackRef.current?.();
      },
      onError: (error: string) => {
        setError(error);
        setPendingMessage(null);
      },
      onTitleComplete: (title: string) => {
        // 전체 refetch 없이 sidebar의 session title 업데이트
        const sessionId = loadSessionIdRef.current;
        if (sessionId && title) {
          updateSessionTitle(sessionId, title);
        }
      },
      onReconnected: (stage: CurrentStage) => {
        updateStreamState({ currentStage: stage });
        // 참고: loadSession이 재연결 전에 server에서 message를 이미 로드하므로
        // userMessage는 여기서 더 이상 사용되지 않음
        setReconnecting(false);
      },
      onProcessingStart: () => {
        setProcessing(true);
        setAborted(false);
        setError(null);
      },
      onProcessingEnd: () => {
        setProcessing(false);
        setReconnecting(false);
      },
    }),
    [
      updateStreamState,
      setMessages,
      setPendingMessage,
      setError,
      setReconnecting,
      setProcessing,
      setAborted,
      updateSessionTitle,
      updateSessionTimestamp,
    ]
  );

  const { startStream, reconnectStream, abortStream } =
    useCouncilStream(streamCallbacks);

  // Unmount 시 진행 중인 요청/stream cleanup
  useEffect(() => {
    return () => {
      loadAbortControllerRef.current?.abort();
      loadAbortControllerRef.current = null;
      loadSessionIdRef.current = null;
      onCompleteCallbackRef.current = undefined;
      abortStream();
    };
  }, [abortStream]);

  /**
   * Council session 로드
   */
  const loadSession = useCallback(
    async (sessionId: string) => {
      // 이전 진행 중인 요청 취소 (race condition 방지)
      loadAbortControllerRef.current?.abort();
      const controller = new AbortController();
      loadAbortControllerRef.current = controller;

      // 현재 session ID 추적
      loadSessionIdRef.current = sessionId;

      // 진행 중인 SSE stream abort
      abortStream();

      // Loading state 설정 - LoadingState가 기존 content를 숨김
      setLoading(true);

      // Stream state 재설정 (loading 중에는 시각적 영향 없음)
      resetStreamState();

      // Status flag 재설정
      setProcessing(false);
      setReconnecting(false);
      setAborted(false);
      setError(null);
      setInputExpanded(false);

      // 참고: 여기서 message를 clear하지 않음 - LoadingState가 이미 숨기고 있음
      // Split context 업데이트 타이밍으로 인해 clear하면 EmptyState가 깜빡임

      try {
        const session = await getCouncilSession(sessionId, controller.signal);

        // Session이 변경된 경우 건너뛰기 (race condition)
        if (loadSessionIdRef.current !== sessionId) {
          return;
        }

        // Message를 직접 교체 (빈 session과 비어있지 않은 session 모두 처리)
        setMessages(session.messages);

        // 활성 처리 확인 후 필요시 재연결
        const status = await getProcessingStatus(sessionId, controller.signal);

        // Session이 변경된 경우 건너뛰기 (race condition)
        if (loadSessionIdRef.current !== sessionId) {
          return;
        }

        if (status.isProcessing && status.canReconnect) {
          console.log(
            `[Council] Active processing found for session ${sessionId}, reconnecting...`
          );
          setReconnecting(true);
          reconnectStream(sessionId);
        }
      } catch (err) {
        // 의도적 취소 무시 (AbortController/axios)
        if (isAbortError(err)) {
          return;
        }

        console.error("Error loading council session:", err);

        // 여전히 동일한 session이면 error 설정
        if (loadSessionIdRef.current === sessionId) {
          setError("Failed to load session");
        }
      } finally {
        // 여전히 동일한 session이면 loading state 업데이트
        if (loadSessionIdRef.current === sessionId) {
          setLoading(false);
        }
      }
    },
    [abortStream, reconnectStream, resetStreamState, setMessages, setLoading, setProcessing, setReconnecting, setAborted, setError, setInputExpanded]
  );

  const sendMessage = useCallback(
    (sessionId: string, content: string, mode: CouncilMode = 'lite', onComplete?: () => void) => {
      // 나중에 사용하기 위해 callback 저장
      onCompleteCallbackRef.current = onComplete;

      // Stream state 초기화
      resetStreamState();
      setPendingMessage(content);

      // mode와 함께 streaming 시작
      startStream(sessionId, content, mode);
    },
    [startStream, resetStreamState, setPendingMessage]
  );

  const abortProcessing = useCallback(
    async (sessionId: string) => {
      // 1. 로컬 SSE 연결 abort
      abortStream();

      // 2. Backend에 abort 전달
      try {
        await abortCouncilProcessing(sessionId);
      } catch {
        // 무시 - 처리가 이미 완료되었을 수 있음
      }

      // 3. UI state 업데이트
      updateStreamState({ currentStage: "idle" });
      setProcessing(false);
      setAborted(true);
      setPendingMessage(null);
    },
    [abortStream, updateStreamState, setProcessing, setAborted, setPendingMessage]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, [setError]);

  // Split context에서 state 객체 구성 (context 객체가 아닌 개별 값 사용)
  const { messages, pendingMessage } = messagesContext;
  const {
    currentStage,
    stage1Responses,
    stage1StreamingContent,
    stage2Reviews,
    stage2StreamingContent,
    stage3Synthesis,
    stage3StreamingContent,
    stage3ReasoningContent,
    labelToModel,
    aggregateRankings,
  } = streamContext;
  const { isProcessing, isReconnecting, wasAborted, isLoading, error, isInputExpanded } =
    statusContext;

  const state: CouncilState = useMemo(
    () => ({
      messages,
      pendingMessage,
      currentStage,
      stage1Responses,
      stage1StreamingContent,
      stage2Reviews,
      stage2StreamingContent,
      stage3Synthesis,
      stage3StreamingContent,
      stage3ReasoningContent,
      labelToModel,
      aggregateRankings,
      isProcessing,
      isReconnecting,
      wasAborted,
      isLoading,
      error,
      isInputExpanded,
    }),
    [
      messages,
      pendingMessage,
      currentStage,
      stage1Responses,
      stage1StreamingContent,
      stage2Reviews,
      stage2StreamingContent,
      stage3Synthesis,
      stage3StreamingContent,
      stage3ReasoningContent,
      labelToModel,
      aggregateRankings,
      isProcessing,
      isReconnecting,
      wasAborted,
      isLoading,
      error,
      isInputExpanded,
    ]
  );

  const contextValue: CouncilContextValue = useMemo(
    () => ({
      ...state,
      loadSession,
      sendMessage,
      abortProcessing,
      clearError,
      setInputExpanded,
    }),
    [state, loadSession, sendMessage, abortProcessing, clearError, setInputExpanded]
  );

  return (
    <CouncilContext.Provider value={contextValue}>
      {children}
    </CouncilContext.Provider>
  );
}

export function useCouncilContext(): CouncilContextValue {
  const context = useContext(CouncilContext);
  if (context === undefined) {
    throw new Error("useCouncilContext must be used within a CouncilProvider");
  }
  return context;
}
