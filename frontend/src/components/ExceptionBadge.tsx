import { cn } from "@/lib/utils";

const categoryConfig: Record<string, { bg: string, text: string, border: string }> = {
  TIMING_DRIFT: { bg: "bg-exception-timing/20", text: "text-exception-timing", border: "border-exception-timing/30" },
  SPLIT_SETTLEMENT: { bg: "bg-exception-split/20", text: "text-exception-split", border: "border-exception-split/30" },
  GST_ROUNDING_DELTA: { bg: "bg-exception-gst/20", text: "text-exception-gst", border: "border-exception-gst/30" },
  WRONG_MDR_TIER: { bg: "bg-exception-mdr/20", text: "text-exception-mdr", border: "border-exception-mdr/30" },
  TDS_MISMATCH: { bg: "bg-exception-tds/20", text: "text-exception-tds", border: "border-exception-tds/30" },
  UNLINKED_DEDUCTION: { bg: "bg-exception-unlinked/20", text: "text-exception-unlinked", border: "border-exception-unlinked/30" },
  NEGATIVE_NET_PAYOUT: { bg: "bg-exception-negative/20", text: "text-exception-negative", border: "border-exception-negative/30" },
  DUPLICATE_UTR: { bg: "bg-exception-duplicate/20", text: "text-exception-duplicate", border: "border-exception-duplicate/30" },
};

export function ExceptionBadge({ category }: { category: string }) {
  const config = categoryConfig[category] || { bg: "bg-muted", text: "text-muted-foreground", border: "border-border" };
  
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded-[4px] text-xs font-medium border",
      config.bg,
      config.text,
      config.border
    )}>
      {category}
    </span>
  );
}