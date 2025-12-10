"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className = "" }: MarkdownRendererProps) {
  return (
    <div
      className={`prose prose-sm prose-invert max-w-none
        prose-headings:text-slate-200
        prose-p:text-slate-300 prose-p:leading-relaxed
        prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline
        prose-strong:text-slate-200
        prose-code:text-emerald-400 prose-code:bg-slate-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none
        prose-pre:bg-slate-800 prose-pre:border prose-pre:border-slate-700
        prose-ul:text-slate-300 prose-ol:text-slate-300
        prose-li:marker:text-slate-500
        prose-blockquote:border-slate-600 prose-blockquote:text-slate-400
        prose-hr:border-slate-700
        prose-table:text-slate-300
        prose-th:text-slate-200 prose-th:border-slate-600
        prose-td:border-slate-700
        ${className}`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
