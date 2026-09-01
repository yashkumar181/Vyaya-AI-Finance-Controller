"use client";

import { useEffect, useState } from "react";

function useCountUp(end: number, durationMs: number = 600, decimals: number = 0) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTime: number;
    let animationFrame: number;

    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / durationMs, 1);
      
      // Easing function for smooth deceleration
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      setCount(easeOutQuart * end);

      if (progress < 1) {
        animationFrame = requestAnimationFrame(step);
      } else {
        setCount(end);
      }
    };

    animationFrame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animationFrame);
  }, [end, durationMs]);

  return count.toFixed(decimals);
}

export function TelemetryStrip() {
  // Hardcoded initial telemetry based on the design spec.
  // In production, wire these into a global state or fetch from /api/run-reconciliation
  const processed = useCountUp(2018, 600, 0);
  const time = useCountUp(2.24, 600, 2);
  const matched = useCountUp(85.53, 600, 2);

  return (
    <div className="w-full bg-black border-b border-border px-8 py-6 flex items-center gap-12">
      <div className="flex flex-col">
        <span className="tabular-mono text-3xl font-medium tracking-tight">
          {Number(processed).toLocaleString('en-US')}
        </span>
        <span className="text-sm text-muted-foreground mt-1">Processed Records</span>
      </div>
      
      <div className="h-10 w-px bg-border"></div>
      
      <div className="flex flex-col">
        <span className="tabular-mono text-3xl font-medium tracking-tight">{time}s</span>
        <span className="text-sm text-muted-foreground mt-1">Execution Time</span>
      </div>
      
      <div className="h-10 w-px bg-border"></div>
      
      <div className="flex flex-col">
        <span className="tabular-mono text-3xl font-medium tracking-tight text-success">{matched}%</span>
        <span className="text-sm text-muted-foreground mt-1">Auto-Matched</span>
      </div>
    </div>
  );
}