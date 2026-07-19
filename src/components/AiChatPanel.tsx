import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, ChatAction, ChatMessage } from "../lib/api";

const WELCOME =
  "Hey — I can do pretty much anything on this site: add/edit/delete clients or projects, mark things paid, log a " +
  "reel, summarize a client's message into instructions, or just answer questions about your data. Try:\n\n" +
  '"Create a client named Damien May" or "Mark Q3 Promo as delivered" or "Who owes me money?"';

export default function AiChatPanel() {
  const [open, setOpen] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [actions, setActions] = useState<Record<number, ChatAction | undefined>>({});
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setError("");
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setSending(true);
    try {
      const res = await api.chat(next);
      const idx = next.length;
      setMessages([...next, { role: "assistant", content: res.reply }]);
      if (res.action) setActions((prev) => ({ ...prev, [idx]: res.action }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong — try again.");
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-xl shadow-lg hover:bg-brand-700"
        title="Open AI Assistant"
      >
        ✨
      </button>
    );
  }

  return (
    <aside className="sticky top-0 flex h-screen w-96 shrink-0 flex-col border-l border-slate-800 bg-slate-900/60">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <span>✨</span> AI Assistant
        </h2>
        <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-200">
          ✕
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <p className="whitespace-pre-wrap text-sm text-slate-400">{WELCOME}</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : ""}>
            <div
              className={`inline-block max-w-[90%] whitespace-pre-wrap rounded-lg px-3 py-2 text-left text-sm ${
                m.role === "user" ? "bg-brand-600 text-white" : "bg-slate-800 text-slate-200"
              }`}
            >
              {m.content}
            </div>
            {actions[i] && (
              <div className="mt-1.5">
                {actions[i]!.ok && actions[i]!.deleted ? (
                  <span className="inline-block rounded-lg border border-slate-600 bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-300">
                    🗑 Deleted "{actions[i]!.deleted}"
                  </span>
                ) : actions[i]!.ok && actions[i]!.project ? (
                  <Link
                    to={`/clients/${actions[i]!.project!.client_id}/projects/${actions[i]!.project!.id}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20"
                  >
                    ✓ {actions[i]!.project!.name} — View Project
                  </Link>
                ) : actions[i]!.ok && actions[i]!.client ? (
                  <Link
                    to={`/clients/${actions[i]!.client!.id}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20"
                  >
                    ✓ {actions[i]!.client!.name} — View Client
                  </Link>
                ) : (
                  <span className="inline-block rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-400">
                    ⚠ {actions[i]!.error}
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
        {sending && <p className="text-sm text-slate-500">Thinking...</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>

      <div className="border-t border-slate-800 p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            placeholder="Ask me anything, or paste a client message..."
            className="w-full resize-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="shrink-0 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </aside>
  );
}
