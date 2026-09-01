"use client";

import { useState } from "react";
import axios from "axios";
import { Send, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const API_BASE = "http://127.0.0.1:8000/api";

export function ChatDrawer({ onClose }: { onClose: () => void }) {
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<{ role: string; content: string }[]>([
    { role: "assistant", content: "Hello! I am Vyaya. Ask me to explain a flagged order or draft a journal entry fix." }
  ]);
  const [chatLoading, setChatLoading] = useState(false);

  const sendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMsg = chatInput;
    setChatInput("");
    setChatHistory((prev) => [...prev, { role: "user", content: userMsg }]);
    setChatLoading(true);

    try {
      const res = await axios.post(`${API_BASE}/agent/chat`, { message: userMsg });
      setChatHistory((prev) => [...prev, { role: "assistant", content: res.data.reply }]);
    } catch (error) {
      setChatHistory((prev) => [...prev, { role: "assistant", content: "Error connecting to the agent." }]);
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0A0A0C]">
      {/* Header - Fixed */}
      <div className="p-4 border-b border-[#1C1C1F] shrink-0 flex items-center justify-between">
        <h2 className="text-[#F2F2F0] font-semibold text-sm">Vyaya Agent</h2>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-6 w-6 text-muted-foreground hover:text-[#F2F2F0]">
          <X className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Messages - Scrollable */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
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