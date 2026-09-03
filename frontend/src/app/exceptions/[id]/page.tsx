"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExceptionBadge } from "@/components/ExceptionBadge";
import { ArrowLeft, FileText, CheckCircle2 } from "lucide-react";
import Link from "next/link";

const API_BASE = "https://vyaya-ai-finance-controller.onrender.com/api";
export default function ExceptionDetailPage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<any>(null);
  const [draft, setDraft] = useState<any>(null);
  const [drafting, setDrafting] = useState(false);

  useEffect(() => {
    axios.get(`${API_BASE}/exceptions?order_id=${params.id}`)
      .then((res) => {
        if (res.data && res.data.length > 0) setData(res.data[0]);
      })
      .catch(console.error);
  }, [params.id]);

  const handleDraft = async () => {
    setDrafting(true);
    try {
      const res = await axios.post(`${API_BASE}/journal-entry`, { order_id: params.id });
      setDraft(res.data.resolution);
    } catch (err) {
      console.error(err);
    } finally {
      setDrafting(false);
    }
  };

  if (!data) return <div className="p-8 text-muted-foreground animate-pulse">Loading exception details...</div>;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/">
          <Button variant="outline" size="icon" className="h-8 w-8 bg-transparent border-border">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-semibold tracking-tight">{data.order_id}</h2>
            <ExceptionBadge category={data.exception_category} />
          </div>
          <p className="text-sm text-muted-foreground">Settlement: {data.settlement_id} • UTR: {data.utr}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-card border-border">
          <CardHeader className="pb-3 border-b border-border/50">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Engine Expected (Computed)</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Gross Amount</span><span className="tabular-mono">₹{Number(data.gross_amount).toFixed(2)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">MDR</span><span className="tabular-mono">₹{Number(data.expected_mdr).toFixed(2)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">GST on MDR</span><span className="tabular-mono">₹{Number(data.expected_gst_on_mdr).toFixed(2)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">TDS (194-O)</span><span className="tabular-mono">₹{Number(data.expected_tds).toFixed(2)}</span></div>
            <div className="flex justify-between font-medium pt-2 border-t border-border/50"><span className="text-[#F2F2F0]">Expected Net</span><span className="tabular-mono text-[#3395FF]">₹{Number(data.expected_net_amount).toFixed(2)}</span></div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-3 border-b border-border/50">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Gateway Claimed (Settled)</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Gross Amount</span><span className="tabular-mono">₹{Number(data.claimed_gross_amount).toFixed(2)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">MDR</span><span className="tabular-mono">₹{Number(data.claimed_mdr_amount).toFixed(2)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">GST on MDR</span><span className="tabular-mono">₹{Number(data.claimed_gst_on_mdr).toFixed(2)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">TDS</span><span className="tabular-mono">₹{Number(data.claimed_tds).toFixed(2)}</span></div>
            <div className="flex justify-between font-medium pt-2 border-t border-border/50"><span className="text-[#F2F2F0]">Claimed Net</span><span className="tabular-mono text-red-400">₹{Number(data.claimed_net_amount).toFixed(2)}</span></div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={handleDraft} disabled={drafting} className="bg-[#3395FF] hover:bg-[#2879D0] text-white">
          <FileText className="mr-2 h-4 w-4" />
          {drafting ? "Drafting..." : "Draft Journal Entry"}
        </Button>
      </div>

      {draft && (
        <Card className="bg-[#0A0A0C] border-[#1C1C1F] mt-6">
          <CardHeader className="bg-[#151518] border-b border-[#1C1C1F]">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-400" />
              <CardTitle className="text-base text-[#F2F2F0]">Draft Adjustment Entry</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            <div className="bg-background/50 p-4 rounded-md border border-border">
              <p className="text-sm text-[#F2F2F0] leading-relaxed">{draft.root_cause_analysis}</p>
            </div>
            
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase border-b border-border">
                <tr>
                  <th className="pb-2 font-medium">Account</th>
                  <th className="pb-2 font-medium">Debit</th>
                  <th className="pb-2 font-medium">Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                <tr>
                  <td className="py-3 text-[#F2F2F0]">{draft.account_debit}</td>
                  <td className="py-3 tabular-mono text-muted-foreground">{draft.amount > 0 ? `₹${draft.amount.toFixed(2)}` : '-'}</td>
                  <td className="py-3 tabular-mono text-muted-foreground">-</td>
                </tr>
                <tr>
                  <td className="py-3 text-[#F2F2F0]">{draft.account_credit}</td>
                  <td className="py-3 tabular-mono text-muted-foreground">-</td>
                  <td className="py-3 tabular-mono text-muted-foreground">{draft.amount > 0 ? `₹${draft.amount.toFixed(2)}` : '-'}</td>
                </tr>
              </tbody>
            </table>

            <div className="space-y-1 pt-4 border-t border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Narration</p>
              <p className="text-sm text-[#F2F2F0] font-mono bg-[#151518] p-3 rounded">{draft.narration}</p>
            </div>
            
            <p className="text-xs text-amber-500/80 italic text-center pt-2">{draft.status}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}