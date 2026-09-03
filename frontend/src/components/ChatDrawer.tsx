"use client";

import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { Send, X, Plus } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const API_BASE = "https://vyaya-ai-finance-controller.onrender.com/api";
const CONVERSATION_ID_KEY = "vyaya_conversation_id";
const REQUEST_TIMEOUT_MS = 40000; // 40s — generous for tool-calling round trips, but bounded

const GREETING = {
  role: "assistant",
  content: "Hello! I am Vyaya. Ask me to explain a flagged order or draft a journal entry fix.",
};

function getOrCreateConversationId(): string {
  if (typeof window === "undefined") return "default";
  let id = window.localStorage.getItem(CONVERSATION_ID_KEY);
  if (!id) {
    id = `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    window.localStorage.setItem(CONVERSATION_ID_KEY, id);
  }
  return id;
}

function generateConversationId(): string {
  return `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ChatDrawer({ onClose }: { onClose: () => void }) {
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<{ role: string; content: string }[]>([GREETING]);
  const [chatLoading, setChatLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const [conversationId, setConversationId] = useState<string>(() => getOrCreateConversationId());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadHistory = async (id: string) => {
    setHistoryLoaded(false);
    try {
      const res = await axios.get(`${API_BASE}/agent/chat/history`, {
        params: { conversation_id: id },
      });
      const stored = res.data.messages as { role: string; content: string }[];
      setChatHistory(stored && stored.length > 0 ? [GREETING, ...stored] : [GREETING]);
    } catch (error) {
      setChatHistory([GREETING]);
    } finally {
      setHistoryLoaded(true);
    }
  };

  useEffect(() => {
    loadHistory(conversationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chatHistory, chatLoading]);

  // Starts a brand new conversation: fresh ID, stored as the new active
  // one, chat visibly resets to just the greeting. The OLD conversation
  // is left as-is on the backend — nothing is deleted, just abandoned.
  const startNewChat = () => {
    const newId = generateConversationId();
    window.localStorage.setItem(CONVERSATION_ID_KEY, newId);
    setConversationId(newId);
    setChatHistory([GREETING]);
    setHistoryLoaded(true);
  };

  const sendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMsg = chatInput;
    setChatInput("");
    setChatHistory((prev) => [...prev, { role: "user", content: userMsg }]);
    setChatLoading(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await axios.post(
        `${API_BASE}/agent/chat`,
        { message: userMsg, conversation_id: conversationId },
        { signal: controller.signal }
      );
      setChatHistory((prev) => [...prev, { role: "assistant", content: res.data.reply }]);
    } catch (error: any) {
      const isTimeout = error.code === "ECONNABORTED" || error.name === "CanceledError" || axios.isCancel(error);
      setChatHistory((prev) => [
        ...prev,
        {
          role: "assistant",
          content: isTimeout
            ? "Request timed out — the agent took too long to respond. Please try again."
            : "Error connecting to the agent. Please try again.",
        },
      ]);
    } finally {
      clearTimeout(timeoutId);
      // Always re-enable input, whether the request succeeded, failed,
      // or timed out — the user should never be permanently stuck.
      setChatLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0A0A0C]">
      {/* Header - Fixed */}
      <div className="p-4 border-b border-[#1C1C1F] shrink-0 flex items-center justify-between">
        <h2 className="text-[#F2F2F0] font-semibold text-sm">Vyaya Agent</h2>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={startNewChat}
            title="Start a new chat"
            className="h-6 w-6 text-muted-foreground hover:text-[#F2F2F0]"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-6 w-6 text-muted-foreground hover:text-[#F2F2F0]">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Messages - Scrollable */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
        {!historyLoaded && (
          <div className="text-xs text-muted-foreground text-center py-4">Loading conversation...</div>
        )}

        {chatHistory.map((msg, idx) => (
          <div
            key={idx}
            className={cn(
              "p-3 rounded-md text-sm",
              msg.role === "user"
                ? "bg-[#3395FF]/10 text-[#3395FF] ml-auto max-w-[85%]"
                : "bg-[#1C1C1F] text-[#F2F2F0] max-w-[95%]"
            )}
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                table: ({ node, ...props }) => (
                  <div className="w-full overflow-x-auto my-3 border border-[#1C1C1F] rounded-[4px]">
                    <table className="w-full text-xs border-collapse tabular-mono" {...props} />
                  </div>
                ),
                th: ({ node, ...props }) => (
                  <th className="border-b border-[#1C1C1F] bg-[#151518] text-left p-2 text-muted-foreground font-medium font-sans" {...props} />
                ),
                td: ({ node, ...props }) => <td className="border-b border-[#1C1C1F] p-2" {...props} />,
                strong: ({ node, ...props }) => <strong className="font-medium text-[#F2F2F0]" {...props} />,
              }}
            >
              {msg.content}
            </ReactMarkdown>
          </div>
        ))}

        {chatLoading && (
          <div className="p-3 rounded-md text-sm bg-[#1C1C1F] max-w-[85%] text-muted-foreground animate-pulse">
            Analyzing ledger data...
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area - Fixed */}
      <div className="p-4 border-t border-[#1C1C1F] shrink-0 bg-[#0A0A0C]">
        <form onSubmit={sendChatMessage} className="flex gap-2">
          <Input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Ask about an order..."
            disabled={chatLoading}
            className="bg-black border-[#1C1C1F] focus-visible:ring-[#3395FF] text-[#F2F2F0]"
          />
          <Button type="submit" size="icon" disabled={chatLoading || !chatInput.trim()} className="bg-[#3395FF] hover:bg-[#3395FF]/90 text-white shrink-0">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}