/**
 * Council feature용 model mapping utility
 * Model identifier와 표시 이름 간 변환 처리
 */

import type { Stage1Response } from "../types/council.types";
import type { ModelMapping } from "../types/types";

/**
 * Model identifier를 읽기 쉬운 표시 이름으로 변환
 *
 * @example
 * formatModelName("anthropic/claude-sonnet-4") // "Claude Sonnet 4"
 * formatModelName("openai/gpt-4o") // "Gpt 4o"
 */
export function formatModelName(model: string): string {
  const parts = model.split("/");
  const name = parts[parts.length - 1];
  return name
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * stage1 response에서 label-to-model mapping 구성
 * 익명화된 label("Response A", "Response B" 등)을 실제 model 이름으로 mapping
 *
 * @example
 * const stage1 = [
 *   { model: "anthropic/claude-sonnet-4", ... },
 *   { model: "openai/gpt-4o", ... }
 * ];
 * buildLabelToModel(stage1);
 * // { "Response A": "anthropic/claude-sonnet-4", "Response B": "openai/gpt-4o" }
 */
export function buildLabelToModel(stage1: Stage1Response[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  stage1.forEach((response, index) => {
    const label = `Response ${String.fromCharCode(65 + index)}`; // A, B, C...
    mapping[label] = response.model;
  });
  return mapping;
}

/**
 * model-to-label mapping 구성 (buildLabelToModel의 역방향)
 *
 * @example
 * buildModelToLabel(stage1);
 * // { "anthropic/claude-sonnet-4": "Response A", "openai/gpt-4o": "Response B" }
 */
export function buildModelToLabel(stage1: Stage1Response[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  stage1.forEach((response, index) => {
    const label = `Response ${String.fromCharCode(65 + index)}`;
    mapping[response.model] = label;
  });
  return mapping;
}

/**
 * label-to-model 및 model-to-label mapping 모두 구성
 */
export function buildModelMapping(stage1: Stage1Response[]): ModelMapping {
  return {
    labelToModel: buildLabelToModel(stage1),
    modelToLabel: buildModelToLabel(stage1),
  };
}

/**
 * Model의 label 조회 (예: "Response A")
 */
export function getLabelForModel(
  model: string,
  modelToLabel: Record<string, string>
): string | undefined {
  return modelToLabel[model];
}

/**
 * Label의 model 조회 (예: "anthropic/claude-sonnet-4")
 */
export function getModelForLabel(
  label: string,
  labelToModel: Record<string, string>
): string | undefined {
  return labelToModel[label];
}
