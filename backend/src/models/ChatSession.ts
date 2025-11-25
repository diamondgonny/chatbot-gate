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
  token: string;           // The session token from Gate validation
  messages: IMessage[];
  createdAt: Date;
  updatedAt: Date;
}

const ChatSessionSchema = new Schema<IChatSession>(
  {
    token: { type: String, required: true, unique: true, index: true },
    messages: [MessageSchema],
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt
  }
);

// Models
export const ChatSession = mongoose.model<IChatSession>('ChatSession', ChatSessionSchema);
