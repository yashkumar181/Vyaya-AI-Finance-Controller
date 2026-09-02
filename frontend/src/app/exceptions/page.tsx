"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExceptionBadge } from "@/components/ExceptionBadge";
import { CheckCircle2 } from "lucide-react";
import { MoneyFlowBar } from "@/components/MoneyFlowBar";

const API_BASE = "http://127.0.0.1:8000/api";
const CATEGORIES = [
  "ALL", "TIMING_DRIFT", "SPLIT_SETTLEMENT", "GST_ROUNDING_DELTA", 
  "WRONG_MDR_TIER", "TDS_MISMATCH", "UNLINKED_DEDUCTION", 
  "NEGATIVE_NET_PAYOUT", "DUPLICATE_UTR"
];

export default function ExceptionsPage() {
  const [exceptions, setExceptions] = useState<any[]>([]);
  const [filter, setFilter] = useState("ALL");
  const [selectedExc, setSelectedExc] = useState<any | null>(null);
  const [draft, setDraft] = useState<any | null>(null);
  const [drafting, setDrafting] = useState(false);

  useEffect(() => {
    const url = filter === "ALL" 
      ? `${API_BASE}/exceptions?limit=100` 
      : `${API_BASE}/exceptions?category=${filter}&limit=100`;
      
    axios.get(url).then(res => setExceptions(res.data)).catch(console.error);
  }, [filter]);

  const handleDraft = async () => {
    if (!selectedExc) return;
    setDrafting(true);
    try {
      const res = await axios.post(`${API_BASE}/journal-entry`, { order_id: selectedExc.order_id });
      setDraft(res.data.resolution);
    } catch (error) {
      console.error("Failed to draft entry");
    } finally {
      setDrafting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight mb-1">Exception Queue</h2>
        <p className="text-sm text-muted-foreground">Flagged discrepancies requiring review or correction.</p>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`px-3 py-1.5 text-xs font-medium rounded-[4px] border transition-colors ${
              filter === cat 
                ? "bg-[#1C1C1F] border-[#3395FF] text-[#F2F2F0]" 
                : "bg-transparent border-[#1C1C1F] text-muted-foreground hover:bg-[#0A0A0C]"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <Card className="bg-card border-border overflow-hidden">
        <Table>
          <TableHeader className="bg-[#151518]">
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="font-sans font-medium text-muted-foreground">Order ID</TableHead>
              <TableHead className="font-sans font-medium text-muted-foreground">Settlement ID</TableHead>
              <TableHead className="font-sans font-medium text-muted-foreground">Category</TableHead>
              <TableHead className="text-right font-sans font-medium text-muted-foreground">Expected (₹)</TableHead>
              <TableHead className="text-right font-sans font-medium text-muted-foreground">Claimed (₹)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {exceptions.map((exc, index) => (
              <TableRow 
                key={`${exc.order_id}-${exc.settlement_id}-${index}`} 
                className="border-border hover:bg-[#151518] cursor-pointer"
                onClick={() => { setSelectedExc(exc); setDraft(null); }}
              >
                <TableCell className="tabular-mono text-xs">{exc.order_id}</TableCell>
                <TableCell className="tabular-mono text-xs text-muted-foreground">{exc.settlement_id}</TableCell>
                <TableCell><ExceptionBadge category={exc.exception_category} /></TableCell>
                <TableCell className="text-right tabular-mono text-xs">{Number(exc.expected_net_amount).toFixed(2)}</TableCell>
                <TableCell className="text-right tabular-mono text-xs text-destructive">{Number(exc.claimed_net_amount).toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!selectedExc} onOpenChange={(open) => !open && setSelectedExc(null)}>
        <DialogContent className="sm:max-w-[700px] bg-[#0A0A0C] border-border p-0 flex flex-col max-h-[90vh] overflow-hidden">
          
          <DialogHeader className="p-6 border-b border-border bg-card shrink-0">
            <DialogTitle className="text-[#F2F2F0] flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xl">Exception Details</span>
                {selectedExc && <ExceptionBadge category={selectedExc.exception_category} />}
              </div>
              {selectedExc && (
                <div className="text-sm font-normal text-muted-foreground mt-1">
                  Order: <span className="tabular-mono text-[#F2F2F0]">{selectedExc.order_id}</span> • 
                  Settlement: <span className="tabular-mono text-[#F2F2F0]">{selectedExc.settlement_id}</span>
                </div>
              )}
            </DialogTitle>
          </DialogHeader>
          
          <div className="p-6 overflow-y-auto flex-1 space-y-6 no-scrollbar">
            {selectedExc && (
              <>
                <MoneyFlowBar data={selectedExc} />
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="bg-card border-border">
                    <CardHeader className="pb-3 border-b border-border/50">
                      <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Engine Expected (Computed)</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-3">
                      <div className="flex justify-between text-sm"><span className="text-muted-foreground">MDR</span><span className="tabular-mono">₹{Number(selectedExc.expected_mdr).toFixed(2)}</span></div>
                      <div className="flex justify-between text-sm"><span className="text-muted-foreground">GST on MDR</span><span className="tabular-mono">₹{Number(selectedExc.expected_gst_on_mdr).toFixed(2)}</span></div>
                      <div className="flex justify-between text-sm"><span className="text-muted-foreground">TDS (194-O)</span><span className="tabular-mono">₹{Number(selectedExc.expected_tds).toFixed(2)}</span></div>
                      <div className="flex justify-between font-medium pt-2 border-t border-border/50"><span className="text-[#F2F2F0]">Expected Net</span><span className="tabular-mono text-[#3395FF]">₹{Number(selectedExc.expected_net_amount).toFixed(2)}</span></div>
                    </CardContent>
                  </Card>

                  <Card className="bg-card border-border">
                    <CardHeader className="pb-3 border-b border-border/50">
                      <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Gateway Claimed (Settled)</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-3">
                      <div className="flex justify-between text-sm"><span className="text-muted-foreground">MDR</span><span className="tabular-mono">₹{Number(selectedExc.claimed_mdr_amount).toFixed(2)}</span></div>
                      <div className="flex justify-between text-sm"><span className="text-muted-foreground">GST on MDR</span><span className="tabular-mono">₹{Number(selectedExc.claimed_gst_on_mdr).toFixed(2)}</span></div>
                      <div className="flex justify-between text-sm"><span className="text-muted-foreground">TDS</span><span className="tabular-mono">₹{Number(selectedExc.claimed_tds).toFixed(2)}</span></div>
                      <div className="flex justify-between font-medium pt-2 border-t border-border/50"><span className="text-[#F2F2F0]">Claimed Net</span><span className="tabular-mono text-destructive">₹{Number(selectedExc.claimed_net_amount).toFixed(2)}</span></div>
                    </CardContent>
                  </Card>
                </div>

                <div className="pt-2">
                  {!draft ? (
                    <Button 
                      onClick={handleDraft} 
                      disabled={drafting}
                      className="w-full bg-[#3395FF] hover:bg-[#2879D0] text-white py-6"
                    >
                      {drafting ? "Analyzing & Drafting..." : "Draft Journal Entry"}
                    </Button>
                  ) : (
                    <Card className="bg-card border-[#3395FF]/30 mt-4 shadow-[0_0_15px_rgba(51,149,255,0.1)]">
                      <CardHeader className="bg-[#151518] border-b border-border py-4">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-400" />
                          <CardTitle className="text-sm font-medium text-[#F2F2F0]">Draft Adjustment Entry</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-4 space-y-4">
                        <p className="text-sm text-[#F2F2F0] leading-relaxed">{draft.root_cause_analysis}</p>
                        
                        <div className="border border-border rounded-sm overflow-hidden bg-background">
                          <Table>
                            <TableHeader className="bg-[#151518]">
                              <TableRow className="border-border">
                                <TableHead className="text-xs text-muted-foreground">Account</TableHead>
                                <TableHead className="text-xs text-right text-muted-foreground">Debit</TableHead>
                                <TableHead className="text-xs text-right text-muted-foreground">Credit</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              <TableRow className="border-border">
                                <TableCell className="text-xs">{draft.account_debit}</TableCell>
                                <TableCell className="text-xs text-right tabular-mono">{draft.amount > 0 ? `₹${Number(draft.amount).toFixed(2)}` : '-'}</TableCell>
                                <TableCell className="text-xs text-right tabular-mono">-</TableCell>
                              </TableRow>
                              <TableRow className="border-border">
                                <TableCell className="text-xs">{draft.account_credit}</TableCell>
                                <TableCell className="text-xs text-right tabular-mono">-</TableCell>
                                <TableCell className="text-xs text-right tabular-mono">{draft.amount > 0 ? `₹${Number(draft.amount).toFixed(2)}` : '-'}</TableCell>
                              </TableRow>
                            </TableBody>
                          </Table>
                        </div>

                        <div className="space-y-1 pt-2">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Narration</p>
                          <p className="text-xs text-muted-foreground font-mono bg-[#151518] p-3 rounded">{draft.narration}</p>
                        </div>
                        
                        <p className="text-[11px] text-amber-500/80 italic text-center pt-2">{draft.status}</p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}