import mongoose, { Schema, Document } from 'mongoose';

// Message interface and schema
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

// ChatSession interface and schema
export interface IChatSession extends Document {
  userId: string;         // UUID for user identification
  sessionId: string;      // UUID for individual chat session
  title: string;          // Session title (defaults to first message)
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
    timestamps: true, // Automatically adds createdAt and updatedAt
  }
);

// Models
export const ChatSession = mongoose.model<IChatSession>('ChatSession', ChatSessionSchema);
