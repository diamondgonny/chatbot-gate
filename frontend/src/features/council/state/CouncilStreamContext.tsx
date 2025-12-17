/**
 * Council Stream Context
 * Message나 status 변경 시 불필요한 re-render를 방지하기 위해
 * streaming state를 분리된 context로 관리
 */

"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import type {
  Stage1Response,
  Stage2Review,
  Stage3Synthesis,
  AggregateRanking,
} from "../domain";
import type { CurrentStage, StreamState } from "../domain";

export interface CouncilStreamContextValue {
  // State
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

  // Actions
  updateStreamState: (partial: Partial<StreamState>) => void;
  updateStreamContent: (model: string, content: string) => void;
  appendStreamContent: (model: string, delta: string) => void;
  resetStreamState: () => void;
}

// undefined 기본값으로 context 생성
const CouncilStreamContext = createContext<
  CouncilStreamContextValue | undefined
>(undefined);

interface CouncilStreamProviderProps {
  children: ReactNode;
}

/**
 * Message/status 변경으로 인한 re-render를 방지하기 위해
 * 분리된 streaming state 제공
 */
export function CouncilStreamProvider({
  children,
}: CouncilStreamProviderProps) {
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

  /**
   * 여러 stream state field를 한 번에 업데이트
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
   * 특정 model의 streaming content 업데이트 (교체)
   */
  const updateStreamContent = useCallback((model: string, content: string) => {
    setStage1StreamingContent((prev) => ({
      ...prev,
      [model]: content,
    }));
  }, []);

  /**
   * 특정 model의 streaming content에 delta 추가
   */
  const appendStreamContent = useCallback((model: string, delta: string) => {
    setStage1StreamingContent((prev) => ({
      ...prev,
      [model]: (prev[model] || "") + delta,
    }));
  }, []);

  /**
   * 모든 stream state를 초기값으로 리셋
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

  const contextValue = useMemo<CouncilStreamContextValue>(
    () => ({
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
      updateStreamState,
      updateStreamContent,
      appendStreamContent,
      resetStreamState,
    }),
    [
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
      updateStreamState,
      updateStreamContent,
      appendStreamContent,
      resetStreamState,
    ]
  );

  return (
    <CouncilStreamContext.Provider value={contextValue}>
      {children}
    </CouncilStreamContext.Provider>
  );
}

/**
 * CouncilStreamProvider 내에서만 사용 가능
 */
export function useCouncilStreamContext(): CouncilStreamContextValue {
  const context = useContext(CouncilStreamContext);
  if (context === undefined) {
    throw new Error(
      "useCouncilStreamContext must be used within a CouncilStreamProvider"
    );
  }
  return context;
}
