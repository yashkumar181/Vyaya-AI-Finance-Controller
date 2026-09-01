"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { Card, CardContent } from "@/components/ui/card";
import { ExceptionBadge } from "@/components/ExceptionBadge";

const API_BASE = "http://127.0.0.1:8000/api";

export default function OverviewPage() {
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [recentExceptions, setRecentExceptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      axios.get(`${API_BASE}/exceptions/summary`),
      axios.get(`${API_BASE}/exceptions?limit=5`)
    ])
      .then(([summaryRes, recentRes]) => {
        setCategoryCounts(summaryRes.data);
        setRecentExceptions(recentRes.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const total = Object.values(categoryCounts).reduce((acc, count) => acc + count, 0) || 1;

  // Map to Tailwind background colors matching your design tokens
  const getCategoryColor = (category: string) => {
    const map: Record<string, string> = {
      TIMING_DRIFT: "bg-exception-timing",
      SPLIT_SETTLEMENT: "bg-exception-split",
      GST_ROUNDING_DELTA: "bg-exception-gst",
      WRONG_MDR_TIER: "bg-exception-mdr",
      TDS_MISMATCH: "bg-exception-tds",
      UNLINKED_DEDUCTION: "bg-exception-unlinked",
      NEGATIVE_NET_PAYOUT: "bg-exception-negative",
      DUPLICATE_UTR: "bg-exception-duplicate",
    };
    return map[category] || "bg-muted";
  };

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight mb-1">Queue Breakdown</h2>
        <p className="text-sm text-muted-foreground">Proportional distribution of active exceptions.</p>
      </div>

      <Card className="bg-card border-border">
        <CardContent className="pt-6">
          {/* Proportional Bar */}
          <div className="flex h-3 w-full rounded-sm overflow-hidden mb-6 bg-[#1C1C1F]">
            {Object.entries(categoryCounts).map(([cat, count]) => (
              <div 
                key={cat} 
                className={`h-full ${getCategoryColor(cat)}`} 
                style={{ width: `${((count as number) / total) * 100}%` }} 
              />
            ))}
          </div>
          
          {/* Legend */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(categoryCounts).map(([cat, count]) => (
              <div key={cat} className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${getCategoryColor(cat)}`} />
                <span className="text-sm text-[#F2F2F0]">{cat}</span>
                <span className="text-sm tabular-mono text-muted-foreground ml-auto">{String(count)}</span>
              </div>
            ))}
            {Object.keys(categoryCounts).length === 0 && !loading && (
              <div className="text-sm text-muted-foreground">No active exceptions.</div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="pt-4">
        <h3 className="text-lg font-semibold tracking-tight mb-4">Recent Activity</h3>
        <Card className="bg-card border-border">
          <div className="divide-y divide-border">
            {recentExceptions.map((exc) => (
              <div key={exc.order_id} className="p-4 flex items-center justify-between hover:bg-[#151518] transition-colors cursor-pointer">
                <div className="flex flex-col gap-1">
                  <span className="tabular-mono text-sm font-medium">{exc.order_id}</span>
                  <span className="text-xs text-muted-foreground tabular-mono">{exc.settlement_id}</span>
                </div>
                <div className="flex items-center gap-6">
                  <span className="tabular-mono text-sm">₹{Number(exc.expected_net_amount).toFixed(2)}</span>
                  <ExceptionBadge category={exc.exception_category} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}