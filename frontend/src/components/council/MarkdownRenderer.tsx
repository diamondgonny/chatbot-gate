"use client";

import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className = "" }: MarkdownRendererProps) {
  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkBreaks]}>{content}</ReactMarkdown>
    </div>
  );
}
