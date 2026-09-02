export function MoneyFlowBar({ data }: { data: any }) {
  const gross = Number(data.gross_amount) || 0;
  if (gross === 0) return null;

  const net = Number(data.expected_net_amount) || 0;
  const mdr = Number(data.expected_mdr) || 0;
  const gst = Number(data.expected_gst_on_mdr) || 0;
  const tds = Number(data.expected_tds) || 0;

  // Calculate percentages for flex widths
  const pNet = Math.max((net / gross) * 100, 0);
  const pMdr = Math.max((mdr / gross) * 100, 0);
  const pGst = Math.max((gst / gross) * 100, 0);
  const pTds = Math.max((tds / gross) * 100, 0);

  return (
    <div className="w-full space-y-2 mb-6 bg-[#0A0A0C] p-4 rounded-lg border border-border">
      <div className="flex justify-between text-xs mb-2">
        <span className="text-muted-foreground uppercase tracking-wider font-semibold">Gross Volume Flow</span>
        <span className="tabular-mono text-[#F2F2F0]">₹{gross.toFixed(2)}</span>
      </div>
      
      {/* The Proportional Bar */}
      <div className="flex h-4 w-full rounded-full overflow-hidden border border-[#1C1C1F]">
        <div style={{ width: `${pNet}%` }} className="bg-[#3395FF] hover:opacity-80 transition-opacity" title={`Net: ₹${net}`} />
        <div style={{ width: `${pMdr}%` }} className="bg-amber-500 hover:opacity-80 transition-opacity" title={`MDR: ₹${mdr}`} />
        <div style={{ width: `${pGst}%` }} className="bg-purple-500 hover:opacity-80 transition-opacity" title={`GST: ₹${gst}`} />
        <div style={{ width: `${pTds}%` }} className="bg-rose-500 hover:opacity-80 transition-opacity" title={`TDS: ₹${tds}`} />
      </div>

      {/* Legend */}
      <div className="flex justify-between text-[11px] text-muted-foreground pt-2">
        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-[#3395FF]" />Net Payout</div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-amber-500" />MDR</div>
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-purple-500" />GST</div>
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-rose-500" />TDS</div>
        </div>
      </div>
    </div>
  );
}