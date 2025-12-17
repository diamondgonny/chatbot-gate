import mongoose, { Schema, Document } from 'mongoose';

// Stage 1: 개별 모델 응답
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

// Stage 2: 순위를 포함한 상호 평가
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

// Stage 3: Chairman 종합
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

// 사용자 메시지
export interface ICouncilUserMessage {
  role: 'user';
  content: string;
  timestamp: Date;
}

// 3단계를 포함한 Assistant 메시지
export interface ICouncilAssistantMessage {
  role: 'assistant';
  mode?: 'lite' | 'ultra';     // 이 응답에 사용된 council 모드
  stage1: IStage1Response[];
  stage2?: IStage2Review[];    // 중단 케이스용 선택 사항
  stage3?: IStage3Synthesis;   // 중단 케이스용 선택 사항
  wasAborted?: boolean;        // 처리가 중단된 경우 true
  timestamp: Date;
}

export type ICouncilMessage = ICouncilUserMessage | ICouncilAssistantMessage;

// Council 메시지 스키마 (role로 구분)
const CouncilMessageSchema = new Schema(
  {
    role: { type: String, enum: ['user', 'assistant'], required: true },
    // 사용자 메시지 필드
    content: { type: String },
    // Assistant 메시지 필드
    mode: { type: String, enum: ['lite', 'ultra'] },
    stage1: [Stage1ResponseSchema],
    stage2: [Stage2ReviewSchema],
    stage3: Stage3SynthesisSchema,
    wasAborted: { type: Boolean },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

// Council 세션
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
