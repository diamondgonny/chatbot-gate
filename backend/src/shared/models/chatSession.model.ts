import mongoose, { Schema, Document } from 'mongoose';

// Message 인터페이스 및 스키마
export interface IMessage {
  role: 'user' | 'ai' | 'system';
  content: string;
  timestamp: Date;
}

const MessageSchema = new Schema<IMessage>({
  role: { type: String, enum: ['user', 'ai', 'system'], required: true },
  content: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

// ChatSession 인터페이스 및 스키마
export interface IChatSession extends Document {
  userId: string;         // 사용자 식별을 위한 UUID
  sessionId: string;      // 개별 채팅 세션을 위한 UUID
  title: string;          // 세션 제목 (첫 메시지로 기본 설정)
  messages: IMessage[];
  createdAt: Date;
  updatedAt: Date;
}

const ChatSessionSchema = new Schema<IChatSession>(
  {
    userId: { type: String, required: true, index: true },
    sessionId: { type: String, required: true, unique: true, index: true },
    title: { type: String, default: 'New Chat' },
    messages: [MessageSchema],
  },
  {
    timestamps: true, // createdAt과 updatedAt 자동 추가
  }
);

// 모델
export const ChatSession = mongoose.model<IChatSession>('ChatSession', ChatSessionSchema);
