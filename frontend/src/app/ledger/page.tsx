"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";

const API_BASE = "http://127.0.0.1:8000/api";

export default function LedgerPage() {
  const [ledger, setLedger] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API_BASE}/ledger?limit=50`)
      .then(res => setLedger(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight mb-1">Reconciled Ledger</h2>
        <p className="text-sm text-muted-foreground">Successfully matched orders automatically cleared by the engine.</p>
      </div>

      <Card className="bg-card border-border overflow-hidden">
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
      </Card>
    </div>
  );
}