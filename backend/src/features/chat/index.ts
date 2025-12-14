export { default as chatRoutes } from './chat.routes';
export { default as sessionRoutes } from './session.routes';
export { chatWithAI, getChatHistory } from './chat.controller';
export { createSession, getUserSessions, getSessionById, deleteSession } from './session.controller';

// Re-export services for external consumers
export * as chatService from './services/message.service';
export * as sessionService from './services/session.service';
export * as openaiService from './services/openai.service';
