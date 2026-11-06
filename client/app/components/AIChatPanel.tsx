'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Bot, Send, X, Loader2, Sparkles } from 'lucide-react';
import { sendAiMessage } from '@/lib/api';
import { useIsAuthenticated } from '@/lib/auth';
import { hideLiveAiChat, isPreviewPath } from '@/lib/public-paths';
import { portfolioAiThread } from '@/lib/portfolio-demo-data';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTIONS = [
  'What was my profit last month?',
  'Which vendor do I owe the most?',
  'How many overdue invoices do I have?',
  'Am I spending more than last month?',
];

function contextLabel(pathname: string): string {
  if (pathname === '/reports-preview') return 'reports';
  if (pathname.startsWith('/portfolio-preview/inbox')) return 'inbox';
  if (pathname.startsWith('/portfolio-preview/invoice')) return 'invoices';
  return pathname.split('/')[1] || 'overview';
}

export function AIChatPanel() {
  const pathname = usePathname();
  const authenticated = useIsAuthenticated();
  const demo = pathname ? portfolioAiThread(pathname) : null;
  const [open, setOpen] = useState(Boolean(demo));
  const [messages, setMessages] = useState<Message[]>(demo?.messages ?? []);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const next = portfolioAiThread(pathname);
    setOpen(Boolean(next));
    setMessages(next?.messages ?? []);
  }, [pathname]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [open, messages]);

  async function sendMessage(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: msg }]);
    setLoading(true);
    try {
      if (isPreviewPath(pathname)) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: 'This is a demo workspace. Sign in to ask about live books.' },
        ]);
        return;
      }
      const { reply } = await sendAiMessage(msg, {
        tab: contextLabel(pathname),
        item: pathname,
      });
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : 'Something went wrong.';
      setMessages((prev) => [...prev, { role: 'assistant', content: `⚠️ ${errMsg}` }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  if (hideLiveAiChat(pathname, authenticated)) return null;

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg transition-all duration-200 hover:shadow-xl"
        aria-label="Open AI assistant"
      >
        <Sparkles className="h-5 w-5" />
        <span className="text-sm font-medium">Ask AI</span>
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-20 right-6 z-50 w-96 max-w-[calc(100vw-1.5rem)] flex flex-col rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 bg-blue-600">
            <Bot className="h-5 w-5 text-white" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">AI Financial Assistant</p>
              <p className="text-xs text-blue-200">Context: {contextLabel(pathname)}</p>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/70 hover:text-white" aria-label="Close AI panel">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[280px] max-h-[400px]">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-xs text-zinc-500 dark:text-zinc-400 text-center">
                  Ask me about your finances. I have access to live data from your books.
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => sendMessage(s)}
                      className="text-left text-xs px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center mr-2 flex-shrink-0 mt-0.5">
                    <Bot className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-br-sm'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-bl-sm'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center mr-2 flex-shrink-0">
                  <Bot className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="bg-zinc-100 dark:bg-zinc-800 rounded-2xl rounded-bl-sm px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-zinc-100 dark:border-zinc-800 p-3 flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question…"
              disabled={loading}
              className="flex-1 text-sm px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
