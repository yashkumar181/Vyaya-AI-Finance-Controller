"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, BookOpen, AlertCircle, Download } from "lucide-react";

const routes = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/ledger", label: "Ledger", icon: BookOpen },
  { href: "/exceptions", label: "Exceptions", icon: AlertCircle },
  { href: "/audit", label: "Audit Export", icon: Download },
];

export function MainNav() {
  const pathname = usePathname();

  return (
    <nav className="space-y-1 px-4">
      {routes.map((route) => {
        const active = pathname === route.href;
        return (
          <Link
            key={route.href}
            href={route.href}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand",
              active
                ? "bg-brand/10 text-brand"
                : "text-muted-foreground hover:bg-[#1C1C1F] hover:text-[#F2F2F0]"
            )}
          >
            <route.icon className="h-4 w-4" />
            {route.label}
          </Link>
        );
      })}
    </nav>
  );
}