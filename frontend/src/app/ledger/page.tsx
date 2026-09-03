"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, ChevronLeft, ChevronRight } from "lucide-react";

const API_BASE = "https://vyaya-ai-finance-controller.onrender.com/api";
export default function LedgerPage() {
  const [ledger, setLedger] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // Trigger re-fetch whenever the page changes
  useEffect(() => {
    setLoading(true);
    axios.get(`${API_BASE}/ledger?page=${page}&limit=50`)
      .then(res => setLedger(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page]);

  // Hit the raw API endpoint to trigger the CSV download
  const handleExport = () => {
    window.open(`${API_BASE}/audit-export`, "_blank");
  };

  return (
    <div className="space-y-6">
      
      {/* Header with Export Button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight mb-1">Reconciled Ledger</h2>
          <p className="text-sm text-muted-foreground">Successfully matched orders automatically cleared by the engine.</p>
        </div>
        <Button onClick={handleExport} className="bg-[#3395FF] hover:bg-[#2879D0] text-white">
          <Download className="mr-2 h-4 w-4" />
          Audit Export (CSV)
        </Button>
      </div>

      <Card className="bg-card border-border overflow-hidden flex flex-col">
        <div className="overflow-x-auto min-w-0">
          <Table>
            <TableHeader className="bg-[#151518]">
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="font-sans font-medium text-muted-foreground">Order ID</TableHead>
                <TableHead className="font-sans font-medium text-muted-foreground">Settlement ID</TableHead>
                <TableHead className="font-sans font-medium text-muted-foreground">Payment Instrument</TableHead>
                <TableHead className="font-sans font-medium text-muted-foreground">Settlement Date</TableHead>
                <TableHead className="text-right font-sans font-medium text-muted-foreground">Gross (₹)</TableHead>
                <TableHead className="text-right font-sans font-medium text-muted-foreground">Net (₹)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ledger.map((row) => (
                <TableRow key={row.order_id} className="border-border hover:bg-[#151518]">
                  <TableCell className="tabular-mono text-xs">{row.order_id}</TableCell>
                  <TableCell className="tabular-mono text-xs text-muted-foreground">{row.settlement_id}</TableCell>
                  <TableCell className="text-xs">{row.payment_instrument}</TableCell>
                  <TableCell className="tabular-mono text-xs">{row.settlement_date}</TableCell>
                  <TableCell className="text-right tabular-mono text-xs">{Number(row.gross_amount).toFixed(2)}</TableCell>
                  <TableCell className="text-right tabular-mono text-xs text-success">{Number(row.expected_net_amount).toFixed(2)}</TableCell>
                </TableRow>
              ))}
              {ledger.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No ledger records found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination Footer */}
        <div className="p-4 border-t border-border flex items-center justify-between bg-[#0A0A0C]">
          <span className="text-sm text-muted-foreground">Page {page}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {/* If we have fewer than 50 records, we've hit the last page */}
            <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={ledger.length < 50}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}