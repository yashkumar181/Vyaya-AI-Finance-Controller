"use client";

import { useState } from "react";
import axios from "axios";
import { MessageSquare, Send } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const API_BASE = "http://127.0.0.1:8000/api";

export function ChatDrawer() {
    const [open, setOpen] = useState(false);
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
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
                className={cn(
                    buttonVariants({ variant: "outline" }),
                    "w-full justify-start gap-2 bg-[#1C1C1F] border-[#1C1C1F] hover:bg-[#2A2A2E] text-foreground"
                )}
            >
                <MessageSquare className="h-4 w-4 text-brand" />
                Ask Vyaya
            </SheetTrigger>

            <SheetContent className="w-[400px] sm:w-[400px] bg-card border-l border-border p-0 flex flex-col">
                <SheetHeader className="p-4 border-b border-border">
                    <SheetTitle className="text-left text-[#F2F2F0]">Vyaya Agent</SheetTitle>
                </SheetHeader>

                <ScrollArea className="flex-1 p-4">
                    <div className="space-y-4 pb-4">
                        {chatHistory.map((msg, idx) => (
                            <div
                                key={idx}
                                className={cn(
                                    "p-3 rounded-md text-sm",
                                    msg.role === "user"
                                        ? "bg-brand/10 text-brand ml-auto max-w-[85%]"
                                        : "bg-muted text-foreground max-w-[95%]"
                                )}
                            >
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    components={{
                                        table: ({ node, ...props }) => (
                                            <div className="w-full overflow-x-auto my-3 border border-border rounded-sm">
                                                <table className="w-full text-xs border-collapse tabular-mono" {...props} />
                                            </div>
                                        ),
                                        th: ({ node, ...props }) => (
                                            <th className="border-b border-border bg-[#151518] text-left p-2 text-muted-foreground font-medium font-sans" {...props} />
                                        ),
                                        td: ({ node, ...props }) => (
                                            <td className="border-b border-border p-2" {...props} />
                                        ),
                                        strong: ({ node, ...props }) => (
                                            <strong className="font-medium text-[#F2F2F0]" {...props} />
                                        ),
                                    }}
                                >
                                    {msg.content}
                                </ReactMarkdown>
                            </div>
                        ))}

                        {chatLoading && (
                            <div className="p-3 rounded-md text-sm bg-muted max-w-[85%] text-muted-foreground animate-pulse">
                                Analyzing ledger data...
                            </div>
                        )}
                    </div>
                </ScrollArea>

                <div className="p-4 border-t border-border bg-card">
                    <form onSubmit={sendChatMessage} className="flex gap-2">
                        <Input
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            placeholder="Ask about an order..."
                            disabled={chatLoading}
                            className="bg-black border-border focus-visible:ring-brand"
                        />
                        <Button type="submit" size="icon" disabled={chatLoading || !chatInput.trim()} className="bg-brand hover:bg-brand/90 text-white shrink-0">
                            <Send className="h-4 w-4" />
                        </Button>
                    </form>
                </div>
            </SheetContent>
        </Sheet>
    );
}