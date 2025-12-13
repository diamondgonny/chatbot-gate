/**
 * Model mapping utilities for Council feature
 * Handles conversion between model identifiers and display names
 */

import type { Stage1Response } from "./council.types";
import type { ModelMapping } from "./types";

/**
 * Format a model identifier into a human-readable display name
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
 * Build a label-to-model mapping from stage1 responses
 * Maps anonymized labels ("Response A", "Response B", etc.) to actual model names
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
 * Build a model-to-label mapping (reverse of buildLabelToModel)
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
 * Build both label-to-model and model-to-label mappings
 */
export function buildModelMapping(stage1: Stage1Response[]): ModelMapping {
  return {
    labelToModel: buildLabelToModel(stage1),
    modelToLabel: buildModelToLabel(stage1),
  };
}

/**
 * Get the label for a model (e.g., "Response A")
 */
export function getLabelForModel(
  model: string,
  modelToLabel: Record<string, string>
): string | undefined {
  return modelToLabel[model];
}

/**
 * Get the model for a label (e.g., "anthropic/claude-sonnet-4")
 */
export function getModelForLabel(
  label: string,
  labelToModel: Record<string, string>
): string | undefined {
  return labelToModel[label];
}
