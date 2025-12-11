/**
 * Council State Management Hook
 * Consolidates all council-related state into a single hook
 */

"use client";

import { useState, useCallback, useMemo } from "react";
import type {
  CouncilMessage,
  Stage1Response,
  Stage2Review,
  Stage3Synthesis,
  AggregateRanking,
} from "@/types";
import type { CurrentStage, StreamState } from "@/domain/council";
import { createInitialStreamState } from "@/domain/council";

/**
 * Council state shape
 */
export interface CouncilState {
  // Session data
  messages: CouncilMessage[];
  pendingMessage: string | null;

  // Stream state
  currentStage: CurrentStage;
  stage1Responses: Stage1Response[];
  stage1StreamingContent: Record<string, string>;
  stage2Reviews: Stage2Review[];
  stage2StreamingContent: Record<string, string>;
  stage3Synthesis: Stage3Synthesis | null;
  stage3StreamingContent: string;
  stage3ReasoningContent: string;
  labelToModel: Record<string, string>;
  aggregateRankings: AggregateRanking[];

  // Status flags
  isProcessing: boolean;
  isReconnecting: boolean;
  wasAborted: boolean;
  isLoading: boolean;
  error: string | null;

  // UI state
  isInputExpanded: boolean;
}

/**
 * State actions for updating council state
 */
export interface CouncilStateActions {
  setMessages: (
    messages: CouncilMessage[] | ((prev: CouncilMessage[]) => CouncilMessage[])
  ) => void;
  setPendingMessage: (msg: string | null) => void;
  updateStreamState: (partial: Partial<StreamState>) => void;
  setProcessing: (isProcessing: boolean) => void;
  setReconnecting: (isReconnecting: boolean) => void;
  setAborted: (wasAborted: boolean) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  setInputExpanded: (isExpanded: boolean) => void;
  resetStreamState: () => void;
  resetAll: () => void;
}

/**
 * Initial state factory
 */
function createInitialState(): CouncilState {
  const streamState = createInitialStreamState();
  return {
    messages: [],
    pendingMessage: null,
    ...streamState,
    isProcessing: false,
    isReconnecting: false,
    wasAborted: false,
    isLoading: false,
    error: null,
    isInputExpanded: false,
  };
}

/**
 * Hook for managing council state
 */
export function useCouncilState(): [CouncilState, CouncilStateActions] {
  // Session data
  const [messages, setMessages] = useState<CouncilMessage[]>([]);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);

  // Stream state
  const [currentStage, setCurrentStage] = useState<CurrentStage>("idle");
  const [stage1Responses, setStage1Responses] = useState<Stage1Response[]>([]);
  const [stage1StreamingContent, setStage1StreamingContent] = useState<
    Record<string, string>
  >({});
  const [stage2Reviews, setStage2Reviews] = useState<Stage2Review[]>([]);
  const [stage2StreamingContent, setStage2StreamingContent] = useState<
    Record<string, string>
  >({});
  const [stage3Synthesis, setStage3Synthesis] =
    useState<Stage3Synthesis | null>(null);
  const [stage3StreamingContent, setStage3StreamingContent] =
    useState<string>("");
  const [stage3ReasoningContent, setStage3ReasoningContent] =
    useState<string>("");
  const [labelToModel, setLabelToModel] = useState<Record<string, string>>({});
  const [aggregateRankings, setAggregateRankings] = useState<AggregateRanking[]>(
    []
  );

  // Status flags
  const [isProcessing, setIsProcessing] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [wasAborted, setWasAborted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [isInputExpanded, setIsInputExpanded] = useState(false);

  /**
   * Update multiple stream state fields at once
   */
  const updateStreamState = useCallback((partial: Partial<StreamState>) => {
    if (partial.currentStage !== undefined) {
      setCurrentStage(partial.currentStage);
    }
    if (partial.stage1Responses !== undefined) {
      setStage1Responses(partial.stage1Responses);
    }
    if (partial.stage1StreamingContent !== undefined) {
      setStage1StreamingContent(partial.stage1StreamingContent);
    }
    if (partial.stage2Reviews !== undefined) {
      setStage2Reviews(partial.stage2Reviews);
    }
    if (partial.stage2StreamingContent !== undefined) {
      setStage2StreamingContent(partial.stage2StreamingContent);
    }
    if (partial.stage3Synthesis !== undefined) {
      setStage3Synthesis(partial.stage3Synthesis);
    }
    if (partial.stage3StreamingContent !== undefined) {
      setStage3StreamingContent(partial.stage3StreamingContent);
    }
    if (partial.stage3ReasoningContent !== undefined) {
      setStage3ReasoningContent(partial.stage3ReasoningContent);
    }
    if (partial.labelToModel !== undefined) {
      setLabelToModel(partial.labelToModel);
    }
    if (partial.aggregateRankings !== undefined) {
      setAggregateRankings(partial.aggregateRankings);
    }
  }, []);

  /**
   * Reset stream state to initial values
   */
  const resetStreamState = useCallback(() => {
    setCurrentStage("idle");
    setStage1Responses([]);
    setStage1StreamingContent({});
    setStage2Reviews([]);
    setStage2StreamingContent({});
    setStage3Synthesis(null);
    setStage3StreamingContent("");
    setStage3ReasoningContent("");
    setLabelToModel({});
    setAggregateRankings([]);
  }, []);

  /**
   * Reset all state to initial values
   */
  const resetAll = useCallback(() => {
    setMessages([]);
    setPendingMessage(null);
    resetStreamState();
    setIsProcessing(false);
    setIsReconnecting(false);
    setWasAborted(false);
    setIsLoading(false);
    setError(null);
    setIsInputExpanded(false);
  }, [resetStreamState]);

  // Build state object
  const state: CouncilState = {
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
  };

  // Build actions object
  const actions: CouncilStateActions = useMemo(
    () => ({
      setMessages,
      setPendingMessage,
      updateStreamState,
      setProcessing: setIsProcessing,
      setReconnecting: setIsReconnecting,
      setAborted: setWasAborted,
      setLoading: setIsLoading,
      setError,
      setInputExpanded: setIsInputExpanded,
      resetStreamState,
      resetAll,
    }),
    [
      resetAll,
      resetStreamState,
      setError,
      setIsInputExpanded,
      setIsLoading,
      setIsProcessing,
      setIsReconnecting,
      setMessages,
      setPendingMessage,
      setWasAborted,
      updateStreamState,
    ]
  );

  return [state, actions];
}
