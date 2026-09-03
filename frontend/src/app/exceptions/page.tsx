"use client";

import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { useSearchParams } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ExceptionBadge } from "@/components/ExceptionBadge";
import { CheckCircle2, Search } from "lucide-react";
import { MoneyFlowBar } from "@/components/MoneyFlowBar";
import { cn } from "@/lib/utils";

const API_BASE = "http://127.0.0.1:8000/api";
const CATEGORIES = [
  "ALL", "TIMING_DRIFT", "SPLIT_SETTLEMENT", "GST_ROUNDING_DELTA",
  "WRONG_MDR_TIER", "TDS_MISMATCH", "UNLINKED_DEDUCTION",
  "NEGATIVE_NET_PAYOUT", "DUPLICATE_UTR"
];

// Categories where a genuine correction can never exist by construction
// (either always zero, or resolved via a combined multi-row total) — used
// to decide whether the "Claimed Net" figure should ever render in red.
const NEVER_SINGLE_ROW_MISMATCH = new Set(["TIMING_DRIFT"]);

type SplitCombined = {
  combinedClaimed: number;
  batchCount: number;
  matches: boolean;
};

export default function ExceptionsPage() {
  const searchParams = useSearchParams();
  const [exceptions, setExceptions] = useState<any[]>([]);
  const [filter, setFilter] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedExc, setSelectedExc] = useState<any | null>(null);
  const [draft, setDraft] = useState<any | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [splitCombined, setSplitCombined] = useState<SplitCombined | null>(null);
  const [splitLoading, setSplitLoading] = useState(false);

  // Fetch with a limit high enough to cover the full exception set (292
  // total, largest single category is 116) so client-side search actually
  // has everything to search through, regardless of which category filter
  // is active.
  useEffect(() => {
    const url = filter === "ALL"
      ? `${API_BASE}/exceptions?limit=500`
      : `${API_BASE}/exceptions?category=${filter}&limit=500`;

    axios.get(url).then(res => setExceptions(res.data)).catch(console.error);
  }, [filter]);

  // Deep-link support: if the Overview page's Recent Activity links here
  // with ?order_id=X, fetch and auto-open that exception's detail view.
  useEffect(() => {
    const orderIdParam = searchParams.get("order_id");
    if (!orderIdParam) return;

    axios.get(`${API_BASE}/exceptions`, { params: { order_id: orderIdParam } })
      .then((res) => {
        const rows = res.data;
        if (rows && rows.length > 0) {
          openExceptionDetail(rows[0]);
        }
      })
      .catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const displayedExceptions = useMemo(() => {
    if (!searchTerm.trim()) return exceptions;
    const term = searchTerm.trim().toLowerCase();
    return exceptions.filter(
      (exc) =>
        exc.order_id?.toLowerCase().includes(term) ||
        exc.settlement_id?.toLowerCase().includes(term)
    );
  }, [exceptions, searchTerm]);

  const openExceptionDetail = async (exc: any) => {
    setSelectedExc(exc);
    setDraft(null);
    setSplitCombined(null);

    // For SPLIT_SETTLEMENT, a single row's claimed_net_amount is only HALF
    // (or a fraction) of the real picture — fetch every row for this
    // order_id and sum them, so the detail view never shows a misleading
    // single-row "shortfall" that contradicts the actual reconciled total.
    if (exc.exception_category === "SPLIT_SETTLEMENT") {
      setSplitLoading(true);
      try {
        const res = await axios.get(`${API_BASE}/exceptions`, { params: { order_id: exc.order_id } });
        const rows: any[] = res.data;
        const combinedClaimed = rows.reduce((sum, r) => sum + Number(r.claimed_net_amount || 0), 0);
        const expected = Number(exc.expected_net_amount || 0);
        const matches = Math.abs(combinedClaimed - expected) <= 0.10;
        setSplitCombined({ combinedClaimed, batchCount: rows.length, matches });
      } catch (error) {
        console.error("Failed to fetch split settlement rows", error);
      } finally {
        setSplitLoading(false);
      }
    }
  };

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

  // The effective "claimed net" figure to display and color — for
  // SPLIT_SETTLEMENT this is the combined total across all batches once
  // loaded, not the single row's fraction. For everything else it's just
  // the row's own claimed_net_amount, same as before.
  const isSplitSettlement = selectedExc?.exception_category === "SPLIT_SETTLEMENT";
  const effectiveClaimedNet = isSplitSettlement && splitCombined
    ? splitCombined.combinedClaimed
    : Number(selectedExc?.claimed_net_amount || 0);

  const claimedIsMismatch = isSplitSettlement
    ? splitCombined
      ? !splitCombined.matches
      : false // don't flag red while still loading the combined total
    : !NEVER_SINGLE_ROW_MISMATCH.has(selectedExc?.exception_category) &&
      Math.abs(Number(selectedExc?.expected_net_amount || 0) - Number(selectedExc?.claimed_net_amount || 0)) > 0.10;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight mb-1">Exception Queue</h2>
        <p className="text-sm text-muted-foreground">Flagged discrepancies requiring review or correction.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search order or settlement ID..."
            className="pl-8 bg-[#0A0A0C] border-[#1C1C1F] focus-visible:ring-[#3395FF] text-[#F2F2F0] h-9"
          />
        </div>
        {searchTerm && (
          <span className="text-xs text-muted-foreground">
            {displayedExceptions.length} match{displayedExceptions.length === 1 ? "" : "es"}
          </span>
        )}
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
            {displayedExceptions.map((exc, index) => (
              <TableRow
                key={`${exc.order_id}-${exc.settlement_id}-${index}`}
                className="border-border hover:bg-[#151518] cursor-pointer"
                onClick={() => openExceptionDetail(exc)}
              >
                <TableCell className="tabular-mono text-xs">{exc.order_id}</TableCell>
                <TableCell className="tabular-mono text-xs text-muted-foreground">{exc.settlement_id}</TableCell>
                <TableCell><ExceptionBadge category={exc.exception_category} /></TableCell>
                <TableCell className="text-right tabular-mono text-xs">{Number(exc.expected_net_amount).toFixed(2)}</TableCell>
                <TableCell className="text-right tabular-mono text-xs text-destructive">{Number(exc.claimed_net_amount).toFixed(2)}</TableCell>
              </TableRow>
            ))}
            {displayedExceptions.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                  No matching exceptions.
                </TableCell>
              </TableRow>
            )}
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
                <MoneyFlowBar
                  data={isSplitSettlement && splitCombined
                    ? { ...selectedExc, claimed_net_amount: splitCombined.combinedClaimed }
                    : selectedExc}
                />

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
                      <div className="flex justify-between font-medium pt-2 border-t border-border/50">
                        <span className="text-[#F2F2F0]">
                          {isSplitSettlement ? "Combined Claimed Net" : "Claimed Net"}
                        </span>
                        <span className={cn(
                          "tabular-mono",
                          isSplitSettlement && splitLoading
                            ? "text-muted-foreground"
                            : claimedIsMismatch ? "text-destructive" : "text-green-400"
                        )}>
                          {isSplitSettlement && splitLoading
                            ? "Loading..."
                            : `₹${effectiveClaimedNet.toFixed(2)}`}
                        </span>
                      </div>
                      {isSplitSettlement && splitCombined && (
                        <p className="text-[10px] text-muted-foreground text-right pt-1">
                          Combined across {splitCombined.batchCount} settlement batches
                        </p>
                      )}
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