"use client";

import { useState } from "react";
import axios from "axios";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

const API_BASE = "https://vyaya-ai-finance-controller.onrender.com/api";
export default function AuditExportPage() {
  const [downloading, setDownloading] = useState(false);

  const handleExport = async () => {
    setDownloading(true);
    try {
      const response = await axios({
        url: `${API_BASE}/audit-export`,
        method: "GET",
        responseType: "blob", 
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "Vyaya_Audit_Export.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Export failed", error);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight mb-1">Audit Export</h2>
        <p className="text-sm text-muted-foreground">Download the complete, immutable reconciliation lineage for external audit.</p>
      </div>

      <div className="p-8 border border-border bg-card rounded-md flex flex-col items-start gap-4 mt-8">
        <Button 
          onClick={handleExport} 
          disabled={downloading}
          className="bg-[#3395FF] hover:bg-[#3395FF]/90 text-white gap-2"
        >
          <Download className="h-4 w-4" />
          {downloading ? "Generating CSV..." : "Export Audit Trail"}
        </Button>
        <p className="text-xs text-muted-foreground max-w-md leading-relaxed">
          The export contains a complete mapping of UTR → Settlement ID → Order ID, alongside the precise mathematical breakdown of expected vs. claimed tax deductions and MDR fees for every transaction.
        </p>
      </div>
    </div>
  );
}