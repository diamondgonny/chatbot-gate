/**
 * Council Stream Hook
 * Handles SSE streaming using StreamEventProcessor
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

/**
 * Stream callbacks for state updates
 */
export interface UseCouncilStreamCallbacks {
  onStateChange: (partial: Partial<StreamState>) => void;
  onUserMessageConfirmed: (content: string) => void;
  onComplete: (assistantMessage: CouncilAssistantMessage) => void;
  onError: (error: string) => void;
  onTitleComplete: () => void;
  onReconnected: (stage: CurrentStage, userMessage?: string) => void;
  onProcessingStart: () => void;
  onProcessingEnd: () => void;
}

/**
 * Return type for useCouncilStream
 */
export interface UseCouncilStreamReturn {
  startStream: (sessionId: string, content: string, mode?: CouncilMode) => void;
  reconnectStream: (sessionId: string) => Promise<void>;
  abortStream: () => void;
}

/**
 * Hook for managing council SSE streams
 */
export function useCouncilStream(
  callbacks: UseCouncilStreamCallbacks
): UseCouncilStreamReturn {
  // AbortController for cancelling fetch requests
  const abortControllerRef = useRef<AbortController | null>(null);
  // Track if component is still mounted
  const isMountedRef = useRef(true);
  // Store pending message content for user message confirmation
  const pendingContentRef = useRef<string>("");

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  /**
   * Start a new SSE stream for sending a message
   */
  const startStream = useCallback(
    (sessionId: string, content: string, mode: CouncilMode = 'ultra') => {
      // Abort any existing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new AbortController
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      pendingContentRef.current = content;

      // Notify processing start
      callbacks.onProcessingStart();

      // Create processor with callbacks
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
          onTitleComplete: () => {
            if (isMountedRef.current) {
              callbacks.onTitleComplete();
            }
          },
          onReconnected: () => {
            // Not used for new streams
          },
        },
        { isReconnection: false }
      );

      // Process stream
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
              return; // Intentional abort, no error
            }
            callbacks.onError(err.message);
          } else {
            console.error("Error in council stream:", err);
            callbacks.onError("Connection lost");
          }
          callbacks.onProcessingEnd();
        }
      };

      processStream();
    },
    [callbacks]
  );

  /**
   * Reconnect to existing processing
   */
  const reconnectStream = useCallback(
    async (sessionId: string) => {
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      callbacks.onProcessingStart();

      // Create processor for reconnection (ignores chunks)
      const processor = new StreamEventProcessor(
        {
          onStateChange: (partial) => {
            if (isMountedRef.current) {
              callbacks.onStateChange(partial);
            }
          },
          onUserMessageConfirmed: () => {
            // Not used for reconnection
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
          onTitleComplete: () => {
            if (isMountedRef.current) {
              callbacks.onTitleComplete();
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
          // 404 means no active processing - expected in some cases
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
      }
    },
    [callbacks]
  );

  /**
   * Abort current stream
   */
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
