/**
 * StreamEventProcessor를 사용한 SSE streaming 처리
 */

"use client";

import { useCallback, useRef, useEffect } from "react";
import type { CouncilAssistantMessage, CouncilMode } from "../domain";
import type { CurrentStage, StreamState } from "../domain";
import {
  streamSSE,
  reconnectSSE,
  StreamError,
  StreamEventProcessor,
  getCouncilMessageUrl,
  getReconnectUrl,
} from "../services";

export interface UseCouncilStreamCallbacks {
  onStateChange: (partial: Partial<StreamState>) => void;
  onUserMessageConfirmed: (content: string) => void;
  onComplete: (assistantMessage: CouncilAssistantMessage) => void;
  onError: (error: string) => void;
  onTitleComplete: (title: string) => void;
  onReconnected: (stage: CurrentStage, userMessage?: string) => void;
  onProcessingStart: () => void;
  onProcessingEnd: () => void;
}

export interface UseCouncilStreamReturn {
  startStream: (sessionId: string, content: string, mode?: CouncilMode) => void;
  reconnectStream: (sessionId: string) => Promise<void>;
  abortStream: () => void;
}

export function useCouncilStream(
  callbacks: UseCouncilStreamCallbacks
): UseCouncilStreamReturn {
  // Fetch 요청 취소용 AbortController
  const abortControllerRef = useRef<AbortController | null>(null);
  // Component가 여전히 마운트되어 있는지 추적
  const isMountedRef = useRef(true);
  // User message 확인용 pending message content 저장
  const pendingContentRef = useRef<string>("");

  // Unmount 시 cleanup
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    };
  }, []);

  const startStream = useCallback(
    (sessionId: string, content: string, mode: CouncilMode = 'lite') => {
      // 기존 요청 abort
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // 새 AbortController 생성
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      pendingContentRef.current = content;

      // 처리 시작 알림
      callbacks.onProcessingStart();

      // Callback으로 processor 생성
      const processor = new StreamEventProcessor(
        {
          onStateChange: (partial) => {
            if (isMountedRef.current) {
              callbacks.onStateChange(partial);
            }
          },
          onUserMessageConfirmed: () => {
            if (isMountedRef.current) {
              callbacks.onUserMessageConfirmed(pendingContentRef.current);
            }
          },
          onComplete: (msg) => {
            if (isMountedRef.current) {
              callbacks.onComplete(msg);
              callbacks.onProcessingEnd();
            }
          },
          onError: (err) => {
            if (isMountedRef.current) {
              callbacks.onError(err);
              callbacks.onProcessingEnd();
            }
          },
          onTitleComplete: (title: string) => {
            if (isMountedRef.current) {
              callbacks.onTitleComplete(title);
            }
          },
          onReconnected: () => {
            // 새 stream에서는 사용 안 함
          },
        },
        { isReconnection: false }
      );

      const processStream = async () => {
        try {
          const url = getCouncilMessageUrl(sessionId);
          const stream = streamSSE(url, { content, mode }, abortController.signal);

          for await (const event of stream) {
            processor.processEvent(event);
          }
        } catch (err) {
          if (!isMountedRef.current) return;

          if (err instanceof StreamError) {
            if (err.isAborted) {
              return; // 의도적 abort, error 아님
            }
            callbacks.onError(err.message);
          } else {
            console.error("Error in council stream:", err);
            callbacks.onError("Connection lost");
          }
          callbacks.onProcessingEnd();
        } finally {
          if (abortControllerRef.current === abortController) {
            abortControllerRef.current = null;
          }
        }
      };

      processStream();
    },
    [callbacks]
  );

  const reconnectStream = useCallback(
    async (sessionId: string) => {
      // 다중 동시 stream 방지를 위해 기존 요청 abort
      abortControllerRef.current?.abort();

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      callbacks.onProcessingStart();

      // 재연결용 processor 생성 (chunk 무시)
      const processor = new StreamEventProcessor(
        {
          onStateChange: (partial) => {
            if (isMountedRef.current) {
              callbacks.onStateChange(partial);
            }
          },
          onUserMessageConfirmed: () => {
            // 재연결에서는 사용 안 함
          },
          onComplete: (msg) => {
            if (isMountedRef.current) {
              callbacks.onComplete(msg);
              callbacks.onProcessingEnd();
            }
          },
          onError: (err) => {
            if (isMountedRef.current) {
              callbacks.onError(err);
              callbacks.onProcessingEnd();
            }
          },
          onTitleComplete: (title: string) => {
            if (isMountedRef.current) {
              callbacks.onTitleComplete(title);
            }
          },
          onReconnected: (stage, userMessage) => {
            if (isMountedRef.current) {
              callbacks.onReconnected(stage, userMessage);
            }
          },
        },
        { isReconnection: true }
      );

      try {
        const url = getReconnectUrl(sessionId);
        const stream = reconnectSSE(url, abortController.signal);

        for await (const event of stream) {
          processor.processEvent(event);
        }
      } catch (err) {
        if (!isMountedRef.current) return;

        if (err instanceof StreamError) {
          if (err.isAborted) {
            return;
          }
          // 404는 활성 처리 없음을 의미 - 일부 경우에서 예상됨
          if (err.status === 404) {
            callbacks.onProcessingEnd();
            return;
          }
          callbacks.onError(err.message);
        } else {
          console.error("Error reconnecting to council stream:", err);
          callbacks.onError("Failed to reconnect");
        }
        callbacks.onProcessingEnd();
      } finally {
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
        }
      }
    },
    [callbacks]
  );

  const abortStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  return {
    startStream,
    reconnectStream,
    abortStream,
  };
}
