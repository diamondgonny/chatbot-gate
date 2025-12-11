import mongoose, { Schema, Document } from 'mongoose';

// Stage 1: Individual model response
export interface IStage1Response {
  model: string;
  response: string;
  responseTimeMs: number;
  promptTokens?: number;
  completionTokens?: number;
}

const Stage1ResponseSchema = new Schema<IStage1Response>(
  {
    model: { type: String, required: true },
    response: { type: String, required: true },
    responseTimeMs: { type: Number, required: true },
    promptTokens: { type: Number },
    completionTokens: { type: Number },
  },
  { _id: false }
);

// Stage 2: Peer review with ranking
export interface IStage2Review {
  model: string;
  ranking: string;
  parsedRanking: string[];
  responseTimeMs: number;
  promptTokens?: number;
  completionTokens?: number;
}

const Stage2ReviewSchema = new Schema<IStage2Review>(
  {
    model: { type: String, required: true },
    ranking: { type: String, required: true },
    parsedRanking: [{ type: String }],
    responseTimeMs: { type: Number, required: true },
    promptTokens: { type: Number },
    completionTokens: { type: Number },
  },
  { _id: false }
);

// Stage 3: Chairman synthesis
export interface IStage3Synthesis {
  model: string;
  response: string;
  reasoning?: string;
  responseTimeMs: number;
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
}

const Stage3SynthesisSchema = new Schema<IStage3Synthesis>(
  {
    model: { type: String, required: true },
    response: { type: String, required: true },
    reasoning: { type: String },
    responseTimeMs: { type: Number, required: true },
    promptTokens: { type: Number },
    completionTokens: { type: Number },
    reasoningTokens: { type: Number },
  },
  { _id: false }
);

// User message
export interface ICouncilUserMessage {
  role: 'user';
  content: string;
  timestamp: Date;
}

// Assistant message with 3 stages
export interface ICouncilAssistantMessage {
  role: 'assistant';
  stage1: IStage1Response[];
  stage2?: IStage2Review[];    // optional for abort cases
  stage3?: IStage3Synthesis;   // optional for abort cases
  wasAborted?: boolean;        // true if processing was aborted
  timestamp: Date;
}

export type ICouncilMessage = ICouncilUserMessage | ICouncilAssistantMessage;

// Council message schema (discriminated by role)
const CouncilMessageSchema = new Schema(
  {
    role: { type: String, enum: ['user', 'assistant'], required: true },
    // User message fields
    content: { type: String },
    // Assistant message fields
    stage1: [Stage1ResponseSchema],
    stage2: [Stage2ReviewSchema],
    stage3: Stage3SynthesisSchema,
    wasAborted: { type: Boolean },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

// Council session
export interface ICouncilSession extends Document {
  userId: string;
  sessionId: string;
  title: string;
  messages: ICouncilMessage[];
  createdAt: Date;
  updatedAt: Date;
}

const CouncilSessionSchema = new Schema<ICouncilSession>(
  {
    userId: { type: String, required: true, index: true },
    sessionId: { type: String, required: true, unique: true, index: true },
    title: { type: String, default: 'New Council Session' },
    messages: [CouncilMessageSchema],
  },
  {
    timestamps: true,
  }
);

export const CouncilSession = mongoose.model<ICouncilSession>(
  'CouncilSession',
  CouncilSessionSchema
);
