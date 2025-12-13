"use client";

import { motion } from "framer-motion";

interface StageProgressProps {
  currentStage: "idle" | "stage1" | "stage2" | "stage3";
  stage1Count: number;
  stage2Count: number;
  hasStage3: boolean;
  wasAborted?: boolean;
}

export function StageProgress({
  currentStage,
  stage1Count,
  stage2Count,
  hasStage3,
  wasAborted = false,
}: StageProgressProps) {
  const stages = [
    { id: "stage1", label: "Individual Responses", count: stage1Count },
    { id: "stage2", label: "Peer Reviews", count: stage2Count },
    { id: "stage3", label: "Final Synthesis", count: hasStage3 ? 1 : 0 },
  ];

  // Determine which stage was aborted (if any)
  const getAbortedStageIndex = (): number => {
    if (!wasAborted) return -1;
    if (hasStage3) return 2;  // stage3 aborted
    if (stage2Count > 0) return 1;  // stage2 aborted
    return 0;  // stage1 aborted
  };

  const abortedStageIndex = getAbortedStageIndex();

  const getStageStatus = (stageId: string) => {
    const stageOrder = ["stage1", "stage2", "stage3"];
    const currentIndex = stageOrder.indexOf(currentStage);
    const stageIndex = stageOrder.indexOf(stageId);

    if (currentStage === "idle") {
      // Check if stage has data
      if (stageId === "stage1" && stage1Count > 0) return "completed";
      if (stageId === "stage2" && stage2Count > 0) return "completed";
      if (stageId === "stage3" && hasStage3) return "completed";
      return "pending";
    }

    if (stageIndex < currentIndex) return "completed";
    if (stageIndex === currentIndex) return "active";
    return "pending";
  };

  // Determine if this stage is the one that was aborted
  const isAbortedStage = (stageIndex: number): boolean => {
    return wasAborted && stageIndex === abortedStageIndex;
  };

  // Determine if this stage completed before abort
  const isCompletedBeforeAbort = (stageIndex: number): boolean => {
    return wasAborted && stageIndex < abortedStageIndex;
  };

  return (
    <div className="flex items-center justify-center gap-2 py-4">
      {stages.map((stage, index) => {
        const status = getStageStatus(stage.id);
        const aborted = isAbortedStage(index);
        const completedBeforeAbort = isCompletedBeforeAbort(index);

        // Determine background color
        const getBgColor = () => {
          if (status === "completed") {
            if (aborted) return "bg-red-500";
            return "bg-green-500";
          }
          if (status === "active") return "bg-blue-500";
          return "bg-slate-700";
        };

        // Determine text color
        const getTextColor = () => {
          if (status === "completed" || status === "active") return "text-white";
          return "text-slate-400";
        };

        return (
          <div key={stage.id} className="flex items-center">
            <div className="flex flex-col items-center">
              <motion.div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${getBgColor()} ${getTextColor()}`}
                animate={status === "active" ? { scale: [1, 1.1, 1] } : {}}
                transition={{ repeat: Infinity, duration: 1.5 }}
              >
                {status === "completed" ? (
                  aborted ? (
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
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  ) : (
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
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )
                ) : (
                  index + 1
                )}
              </motion.div>
              <span
                className={`text-xs mt-1 ${
                  status === "active" ? "text-blue-400" : "text-slate-500"
                }`}
              >
                {stage.label}
              </span>
            </div>
            {index < stages.length - 1 && (
              <div
                className={`w-12 h-0.5 mx-2 ${
                  getStageStatus(stages[index + 1].id) !== "pending"
                    ? isAbortedStage(index + 1)
                      ? "bg-red-500"
                      : "bg-green-500"
                    : "bg-slate-700"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
