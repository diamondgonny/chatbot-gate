/**
 * Council History Builder
 * Builds conversation history for LLM context.
 */

import { COUNCIL } from '../../constants';
import { ICouncilMessage } from '../../models/CouncilSession';
import { OpenRouterMessage } from '../openRouterService';

/**
 * Build conversation history for context
 * Takes recent user messages and assistant stage3 responses
 */
export const buildConversationHistory = (
  messages: ICouncilMessage[]
): OpenRouterMessage[] => {
  const history: OpenRouterMessage[] = [];
  const recentMessages = messages.slice(-COUNCIL.RECENT_MESSAGES_LIMIT * 2);

  for (const msg of recentMessages) {
    if (msg.role === 'user') {
      history.push({ role: 'user', content: msg.content });
    } else if (msg.role === 'assistant' && msg.stage3) {
      history.push({ role: 'assistant', content: msg.stage3.response });
    }
  }

  return history;
};
