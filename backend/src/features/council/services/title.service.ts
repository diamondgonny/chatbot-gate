/**
 * 제목 생성 서비스
 * OpenAI를 사용하여 council 세션을 위한 간결한 3-5 단어 제목 생성
 */

import OpenAI from 'openai';
import { config } from '@shared';

// 제목 생성을 위한 빠르고 저렴한 모델 사용
const TITLE_MODEL = 'gpt-4o-mini';
const MAX_TITLE_LENGTH = 50;
const DEFAULT_TITLE = 'New Conversation';

// 기존 OpenAI client 설정 재사용
const openai = new OpenAI({
  apiKey: config.openaiApiKey,
});

const TITLE_PROMPT = `Generate a very short title (3-5 words maximum) that summarizes the following message.
The title should be concise and descriptive. Do not use quotes or punctuation in the title.

Message: `;

/**
 * 첫 사용자 메시지를 기반으로 대화 제목 생성
 * 생성된 제목 또는 에러 시 대체 제목 반환
 */
export const generateTitle = async (userMessage: string): Promise<string> => {
  try {
    const completion = await openai.chat.completions.create({
      model: TITLE_MODEL,
      messages: [
        { role: 'user', content: `${TITLE_PROMPT}${userMessage}\n\nTitle:` }
      ],
      max_tokens: 30,
      temperature: 0.7,
    });

    let title = completion.choices[0]?.message?.content?.trim() || DEFAULT_TITLE;

    // 제목 정리 - 따옴표 및 추가 공백 제거
    title = title.replace(/^["']|["']$/g, '').trim();

    // 너무 길면 자르기
    if (title.length > MAX_TITLE_LENGTH) {
      title = title.substring(0, MAX_TITLE_LENGTH - 3) + '...';
    }

    return title || DEFAULT_TITLE;
  } catch (error) {
    console.error('Error generating title:', error);
    return DEFAULT_TITLE;
  }
};
