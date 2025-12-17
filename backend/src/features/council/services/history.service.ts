/**
 * Council 히스토리 빌더
 * LLM 컨텍스트를 위한 대화 히스토리 구성
 */

import { COUNCIL } from '@shared';
import type { ICouncilMessage, OpenRouterMessage } from '@shared';

/**
 * 컨텍스트를 위한 대화 히스토리 구성
 * 최근 사용자 메시지 및 assistant stage3 응답 포함
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
