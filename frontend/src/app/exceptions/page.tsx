"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ExceptionBadge } from "@/components/ExceptionBadge";

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
            {exceptions.map((exc,index) => (
              <TableRow 
                key={`${exc.order_id}-${exc.settlement_id}-${index}`} 
                className="border-border hover:bg-[#151518] cursor-pointer"
                onClick={() => { setSelectedExc(exc); setDraft(null); }}
              >
                <TableCell className="tabular-mono text-xs">{exc.order_id}</TableCell>
                <TableCell className="tabular-mono text-xs text-muted-foreground">{exc.settlement_id}</TableCell>
                <TableCell><ExceptionBadge category={exc.exception_category} /></TableCell>
                <TableCell className="text-right tabular-mono text-xs">{Number(exc.expected_net_amount).toFixed(2)}</TableCell>
                <TableCell className="text-right tabular-mono text-xs">{Number(exc.claimed_net_amount).toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Sheet open={!!selectedExc} onOpenChange={(open) => !open && setSelectedExc(null)}>
        <SheetContent className="w-[500px] sm:max-w-[500px] bg-card border-l border-border p-6 overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle className="text-[#F2F2F0] flex items-center justify-between">
              Exception Details
              {selectedExc && <ExceptionBadge category={selectedExc.exception_category} />}
            </SheetTitle>
          </SheetHeader>
          
          {selectedExc && (
            <div className="space-y-8">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground mb-1">Order ID</div>
                  <div className="tabular-mono">{selectedExc.order_id}</div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-1">Settlement ID</div>
                  <div className="tabular-mono">{selectedExc.settlement_id}</div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-medium border-b border-border pb-2">Value Comparison</h4>
                <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                  <div>Field</div>
                  <div className="text-right">Expected</div>
                  <div className="text-right">Claimed</div>
                </div>
                
                {['mdr', 'gst_on_mdr', 'tds', 'net_amount'].map(field => {
                  const exp = Number(selectedExc[`expected_${field}`]).toFixed(2);
                  const clm = Number(selectedExc[`claimed_${field === 'mdr' ? 'mdr_amount' : field}`]).toFixed(2);
                  const mismatch = exp !== clm;
                  
                  return (
                    <div key={field} className="grid grid-cols-3 gap-2 text-sm items-center py-1">
                      <div className="capitalize">{field.replace(/_/g, ' ')}</div>
                      <div className="text-right tabular-mono">{exp}</div>
                      <div className={`text-right tabular-mono ${mismatch ? 'text-destructive font-medium' : ''}`}>
                        {clm}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-4 border-t border-border">
                {!draft ? (
                  <Button 
                    onClick={handleDraft} 
                    disabled={drafting}
                    className="w-full bg-[#3395FF] hover:bg-[#3395FF]/90 text-white"
                  >
                    {drafting ? "Analyzing..." : "Draft Journal Entry"}
                  </Button>
                ) : (
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium">Proposed Correction</h4>
                    <div className="border border-border rounded-sm overflow-hidden">
                      <Table>
                        <TableHeader className="bg-[#151518]">
                          <TableRow className="border-border">
                            <TableHead className="text-xs text-muted-foreground">Debit</TableHead>
                            <TableHead className="text-xs text-muted-foreground">Credit</TableHead>
                            <TableHead className="text-xs text-right text-muted-foreground">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <TableRow className="border-border">
                            <TableCell className="text-xs">{draft.account_debit}</TableCell>
                            <TableCell className="text-xs">{draft.account_credit}</TableCell>
                            <TableCell className="text-xs text-right tabular-mono">{Number(draft.amount).toFixed(2)}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                      <div className="p-3 text-xs text-muted-foreground bg-[#0A0A0C] border-t border-border">
                        {draft.narration}
                      </div>
                    </div>
                    <div className="text-[11px] text-muted-foreground italic">
                      {draft.status}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}