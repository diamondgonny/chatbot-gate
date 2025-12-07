export interface Message {
  id: string;
  role: "user" | "ai";
  content: string;
  timestamp: string;
}

export interface Session {
  sessionId: string;
  title: string;
  lastMessage: {
    content: string;
    role: string;
    timestamp: string;
  } | null;
  updatedAt: string;
  createdAt: string;
}
