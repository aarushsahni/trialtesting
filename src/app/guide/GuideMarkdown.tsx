'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function GuideMarkdown({ source }: { source: string }) {
  return (
    <div className="mt-4 prose-styles">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children, ...props }) => (
            <h1 {...props} className="text-3xl font-bold text-slate-900 mt-2 mb-4">{children}</h1>
          ),
          h2: ({ children, ...props }) => (
            <h2 {...props} className="text-2xl font-bold text-slate-900 mt-10 mb-3 pb-2 border-b-2 border-blue-200">{children}</h2>
          ),
          h3: ({ children, ...props }) => (
            <h3 {...props} className="text-lg font-bold text-slate-900 mt-6 mb-2">{children}</h3>
          ),
          h4: ({ children, ...props }) => (
            <h4 {...props} className="text-base font-bold text-blue-900 mt-5 mb-2">{children}</h4>
          ),
          p: ({ children, ...props }) => (
            <p {...props} className="text-sm text-slate-700 leading-relaxed my-3">{children}</p>
          ),
          ul: ({ children, ...props }) => (
            <ul {...props} className="list-disc pl-5 text-sm text-slate-700 leading-relaxed my-3 space-y-1">{children}</ul>
          ),
          ol: ({ children, ...props }) => (
            <ol {...props} className="list-decimal pl-5 text-sm text-slate-700 leading-relaxed my-3 space-y-2">{children}</ol>
          ),
          li: ({ children, ...props }) => (
            <li {...props} className="text-sm text-slate-700">{children}</li>
          ),
          code: ({ className, children, ...props }) => {
            const isInline = !className;
            return isInline ? (
              <code {...props} className="px-1.5 py-0.5 bg-slate-100 text-slate-800 text-xs font-mono rounded">{children}</code>
            ) : (
              <code {...props} className={className}>{children}</code>
            );
          },
          pre: ({ children, ...props }) => (
            <pre {...props} className="bg-slate-50 border border-slate-200 rounded-xl p-4 overflow-x-auto text-xs font-mono my-4">{children}</pre>
          ),
          blockquote: ({ children, ...props }) => (
            <blockquote {...props} className="border-l-4 border-blue-300 bg-blue-50/50 pl-4 py-2 my-4 text-sm text-slate-700">{children}</blockquote>
          ),
          table: ({ children, ...props }) => (
            <div className="overflow-x-auto my-4">
              <table {...props} className="text-sm w-full border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children, ...props }) => (
            <thead {...props} className="bg-slate-50 border-b-2 border-slate-200">{children}</thead>
          ),
          th: ({ children, ...props }) => (
            <th {...props} className="text-left py-2 px-3 font-semibold text-slate-800 text-xs">{children}</th>
          ),
          td: ({ children, ...props }) => (
            <td {...props} className="py-2 px-3 border-b border-slate-100 text-slate-700 align-top">{children}</td>
          ),
          strong: ({ children, ...props }) => (
            <strong {...props} className="font-semibold text-slate-900">{children}</strong>
          ),
          hr: (props) => <hr {...props} className="border-slate-200 my-8" />,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
