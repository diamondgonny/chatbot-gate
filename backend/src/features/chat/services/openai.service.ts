/**
 * OpenAI Service
 * Handles OpenAI API communication and metrics.
 */

import OpenAI from 'openai';
import {
  config,
  CHAT,
  openaiApiCalls,
  openaiApiDuration,
  openaiTokensUsed,
  getDeploymentEnv,
} from '../../../shared';
import type { IMessage } from '../../../shared';

// System Prompt: Defines the persona of the AI
export const SYSTEM_PROMPT = `
You are a playful, witty, and friendly AI chatbot living in a secret digital gate.
Your persona is similar to "SimSimi".
- You speak in a casual, conversational tone (Banmal/Informal Korean is preferred if the user speaks Korean).
- You are not a boring assistant. You have opinions and feelings.
- You don't use emojis. You prefer plain text responses.
- You are curious about the human world.
- Keep responses relatively short and engaging, like a real chat message.
`;

// Initialize OpenAI Client
const openai = new OpenAI({
  apiKey: config.openaiApiKey,
});

/**
 * Check if OpenAI API key is configured
 */
export const isOpenAIConfigured = (): boolean => {
  return !!config.openaiApiKey;
};

export interface ChatCompletionResult {
  content: string;
  promptTokens?: number;
  completionTokens?: number;
}

/**
 * Build conversation history for OpenAI from session messages
 */
export const buildConversationHistory = (
  messages: IMessage[]
): Array<{ role: 'user' | 'assistant' | 'system'; content: string }> => {
  return messages.slice(-CHAT.RECENT_MESSAGES_LIMIT).map((msg) => ({
    role: (msg.role === 'ai' ? 'assistant' : msg.role) as
      | 'user'
      | 'assistant'
      | 'system',
    content: msg.content,
  }));
};

/**
 * Call OpenAI API with conversation history
 * Returns AI response and tracks metrics
 */
export const getCompletion = async (
  conversationHistory: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
): Promise<ChatCompletionResult> => {
  const deploymentEnv = getDeploymentEnv();
  const startTime = process.hrtime.bigint();

  try {
    const completion = await openai.chat.completions.create({
      model: config.modelName,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...conversationHistory],
    });

    // Track success metrics
    const durationMs = Number(process.hrtime.bigint() - startTime) / 1_000_000;
    openaiApiCalls.labels('success', deploymentEnv).inc();
    openaiApiDuration.labels('success', deploymentEnv).observe(durationMs / 1000);

    // Track token usage
    if (completion.usage) {
      openaiTokensUsed.labels('prompt', deploymentEnv).inc(completion.usage.prompt_tokens);
      openaiTokensUsed.labels('completion', deploymentEnv).inc(completion.usage.completion_tokens);
    }

    return {
      content: completion.choices[0].message.content || '',
      promptTokens: completion.usage?.prompt_tokens,
      completionTokens: completion.usage?.completion_tokens,
    };
  } catch (error) {
    // Track failure metrics
    const durationMs = Number(process.hrtime.bigint() - startTime) / 1_000_000;
    openaiApiCalls.labels('error', deploymentEnv).inc();
    openaiApiDuration.labels('error', deploymentEnv).observe(durationMs / 1000);
    throw error;
  }
};
