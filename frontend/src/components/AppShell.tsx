"use client";

import { useState } from "react";
import { MainNav } from "@/components/MainNav";
import { TelemetryStrip } from "@/components/TelemetryStrip";
import { ChatDrawer } from "@/components/ChatDrawer";
import { Button } from "@/components/ui/button";
import { MessageSquare } from "lucide-react";

export function AppShell({ children }: { children: React.ReactNode }) {
    const [isChatOpen, setIsChatOpen] = useState(false);

    return (
        <div className="flex h-screen w-full overflow-hidden bg-background">
            {/* 1. Fixed Left Rail (Nav Bar) */}
            <aside className="w-[220px] shrink-0 bg-[#0A0A0C] border-r border-[#1C1C1F] flex flex-col justify-between h-screen z-20 relative">
                <div>
                    <div className="p-6 pb-8">
                        <h1 className="text-lg font-semibold tracking-tight text-[#F2F2F0]">Vyaya</h1>
                    </div>
                    <MainNav />
                </div>
                <div className="p-4 border-t border-[#1C1C1F]">
                    <Button
                        variant="outline"
                        onClick={() => setIsChatOpen(!isChatOpen)}
                        className="w-full justify-start gap-2 bg-[#1C1C1F] border-[#1C1C1F] hover:bg-[#2A2A2E] text-[#F2F2F0]"
                    >
                        <MessageSquare className="h-4 w-4 text-[#3395FF]" />
                        {isChatOpen ? "Close Vyaya" : "Ask Vyaya"}
                    </Button>
                </div>
            </aside>

            {/* 2. Fluid Main Content */}
            {/* min-w-0 ensures this container shrinks when the chat opens, rather than pushing the chat off-screen */}
            <main className="flex-1 flex flex-col min-w-0 h-screen relative z-10 bg-background">
                <div className="shrink-0 w-full overflow-x-auto min-w-0 border-b border-border/50">
                    <div className="min-w-max">
                        <TelemetryStrip />
                    </div>
                </div>
                <div className="flex-1 overflow-auto p-8 min-w-0 no-scrollbar">
                    {children}
                </div>
            </main>

            {/* 3. Fixed Chat Panel */}
            {isChatOpen && (
                <aside className="w-[450px] shrink-0 bg-[#0A0A0C] border-l border-[#1C1C1F] flex flex-col h-screen z-20">
                    <div className="flex-1 w-full h-full flex flex-col overflow-hidden">
                        <ChatDrawer onClose={() => setIsChatOpen(false)} />
                    </div>
                </aside>
            )}
        </div>
    );
}