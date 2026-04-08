"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Receipt,
  Briefcase,
  Users,
  BookUser,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { brandLogoSrc } from "@/components/logo";

const nav = [
  { title: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { title: "Leads", href: "/dashboard/leads", icon: Users },
  { title: "Address book", href: "/dashboard/contacts", icon: BookUser },
  { title: "Quote management", href: "/dashboard/quotes", icon: Briefcase },
  { title: "Invoice management", href: "/dashboard/invoice-portal", icon: Receipt },
];

export function CrmSidebar() {
  const pathname = usePathname();
  const { signOut } = useAuth();

  return (
    <aside className="flex h-full min-h-0 w-64 shrink-0 flex-col border-r border-border bg-card">
      <div className="border-b p-4">
        <Link href="/dashboard" className="block">
          <img
            src={brandLogoSrc}
            alt="PrepCorex CRM"
            className="h-auto max-h-12 w-full object-contain object-left"
            width={418}
            height={100}
            decoding="async"
          />
        </Link>
        <p className="mt-2 text-xs text-muted-foreground">Sales & billing</p>
      </div>
      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3">
        {nav.map((item) => {
          const Icon = item.icon;
          const active =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link key={item.href} href={item.href}>
              <span
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {item.title}
              </span>
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-3">
        <Button variant="ghost" className="w-full justify-start gap-2" onClick={() => signOut()}>
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </aside>
  );
}
