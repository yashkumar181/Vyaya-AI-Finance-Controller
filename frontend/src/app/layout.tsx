import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { MainNav } from "@/components/MainNav";
import { TelemetryStrip } from "@/components/TelemetryStrip";
import { ChatDrawer } from "@/components/ChatDrawer";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: "Vyaya Finance Controller",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable} dark`}>
      <body className="bg-black text-[#F2F2F0] min-h-screen flex overflow-hidden selection:bg-brand selection:text-white">
        
        {/* Left Rail */}
        <aside className="w-[220px] bg-[#0A0A0C] border-r border-[#1C1C1F] flex flex-col justify-between shrink-0 h-screen z-20 relative">
          <div>
            <div className="p-6 pb-8">
              <h1 className="text-lg font-semibold tracking-tight text-[#F2F2F0]">Vyaya</h1>
            </div>
            <MainNav />
          </div>
          <div className="p-4 border-t border-[#1C1C1F]">
             {/* Chat Trigger handled internally or globally */}
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col h-screen overflow-hidden relative z-10">
          <TelemetryStrip />
          <div className="flex-1 overflow-auto p-8">
            {children}
          </div>
        </main>

        <ChatDrawer />
      </body>
    </html>
  );
}