"use client";

import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * Normalize escaped newlines from API responses
 * Some models (e.g., Gemini) return reasoning with literal \n instead of actual newlines
 */
function normalizeNewlines(text: string): string {
  // Replace literal \n (backslash + n) with actual newline character
  // Use a regex that matches the escaped sequence, not the actual newline
  return text.replace(/\\n/g, '\n');
}

export function MarkdownRenderer({ content, className = "" }: MarkdownRendererProps) {
  const normalizedContent = normalizeNewlines(content);

  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkBreaks, remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  );
}
