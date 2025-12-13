/**
 * Title Generation Service
 * Generates concise 3-5 word titles for council sessions using OpenAI.
 */

import OpenAI from 'openai';
import { config } from '../../../shared';

// Use a fast, cheap model for title generation
const TITLE_MODEL = 'gpt-4o-mini';
const MAX_TITLE_LENGTH = 50;
const DEFAULT_TITLE = 'New Conversation';

// Reuse the existing OpenAI client configuration
const openai = new OpenAI({
  apiKey: config.openaiApiKey,
});

const TITLE_PROMPT = `Generate a very short title (3-5 words maximum) that summarizes the following message.
The title should be concise and descriptive. Do not use quotes or punctuation in the title.

Message: `;

/**
 * Generate a title for a conversation based on the first user message.
 * Returns the generated title or a fallback on error.
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

    // Clean up the title - remove quotes and extra whitespace
    title = title.replace(/^["']|["']$/g, '').trim();

    // Truncate if too long
    if (title.length > MAX_TITLE_LENGTH) {
      title = title.substring(0, MAX_TITLE_LENGTH - 3) + '...';
    }

    return title || DEFAULT_TITLE;
  } catch (error) {
    console.error('Error generating title:', error);
    return DEFAULT_TITLE;
  }
};
