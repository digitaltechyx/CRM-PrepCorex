"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Receipt,
  Briefcase,
  Users,
  BookUser,
  ShieldAlert,
  LogOut,
  Columns3,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { brandLogoSrc } from "@/components/logo";

const nav = [
  { title: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { title: "Leads", href: "/dashboard/leads", icon: Users },
  { title: "Address book", href: "/dashboard/contacts", icon: BookUser },
  { title: "Spam", href: "/dashboard/spam", icon: ShieldAlert },
  { title: "Pipeline", href: "/dashboard/settings/pipeline", icon: Columns3 },
  { title: "Quote management", href: "/dashboard/quotes", icon: Briefcase },
  { title: "Invoice management", href: "/dashboard/invoice-portal", icon: Receipt },
];

const COLLAPSE_KEY = "crm-sidebar-collapsed";

function NavLinks({
  collapsed,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3">
      {nav.map((item) => {
        const Icon = item.icon;
        const active =
          item.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link key={item.href} href={item.href} onClick={onNavigate} title={item.title}>
            <span
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                collapsed && "justify-center px-2",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed ? <span className="truncate">{item.title}</span> : null}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarBrand({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className={cn("border-b p-4", collapsed && "px-2 py-3")}>
      <Link href="/dashboard" className="block">
        <img
          src={brandLogoSrc}
          alt="PrepCorex CRM"
          className={cn(
            "h-auto w-full object-contain object-left",
            collapsed ? "max-h-9" : "max-h-12"
          )}
          width={418}
          height={100}
          decoding="async"
        />
      </Link>
      {!collapsed ? (
        <p className="mt-2 text-xs text-muted-foreground">Sales & billing</p>
      ) : null}
    </div>
  );
}

function SidebarFooter({
  collapsed,
  onSignOut,
  onNavigate,
}: {
  collapsed?: boolean;
  onSignOut: () => void;
  onNavigate?: () => void;
}) {
  return (
    <div className="border-t p-3">
      <Button
        variant="ghost"
        className={cn("w-full gap-2", collapsed ? "justify-center px-2" : "justify-start")}
        onClick={() => {
          onNavigate?.();
          onSignOut();
        }}
        title="Sign out"
      >
        <LogOut className="h-4 w-4 shrink-0" />
        {!collapsed ? "Sign out" : null}
      </Button>
    </div>
  );
}

export function CrmSidebar() {
  const { signOut } = useAuth();
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);
  const [collapseReady, setCollapseReady] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      // ignore
    }
    setCollapseReady(true);
  }, []);

  useEffect(() => {
    if (!collapseReady) return;
    try {
      window.localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {
      // ignore
    }
  }, [collapsed, collapseReady]);

  // Close drawer when switching to desktop.
  useEffect(() => {
    if (!isMobile) setMobileOpen(false);
  }, [isMobile]);

  const handleSignOut = () => {
    void signOut();
  };

  return (
    <>
      {/* Mobile top bar */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-3 md:hidden">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-10 w-10 shrink-0"
          aria-label="Open menu"
          onClick={() => setMobileOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <Link href="/dashboard" className="min-w-0 flex-1">
          <img
            src={brandLogoSrc}
            alt="PrepCorex CRM"
            className="h-8 w-auto max-w-[180px] object-contain object-left"
            decoding="async"
          />
        </Link>
      </header>

      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="flex w-[min(100vw-3rem,18rem)] flex-col gap-0 p-0">
          <SheetTitle className="sr-only">CRM navigation</SheetTitle>
          <SidebarBrand />
          <NavLinks onNavigate={() => setMobileOpen(false)} />
          <SidebarFooter onSignOut={handleSignOut} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden h-full min-h-0 shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200 md:flex",
          collapsed ? "w-[4.5rem]" : "w-64"
        )}
      >
        <SidebarBrand collapsed={collapsed} />
        <NavLinks collapsed={collapsed} />
        <div className="border-t p-2">
          <Button
            type="button"
            variant="ghost"
            className={cn("w-full gap-2", collapsed ? "justify-center px-2" : "justify-start")}
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? "Expand sidebar" : "Minimize sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4 shrink-0" />
            ) : (
              <>
                <PanelLeftClose className="h-4 w-4 shrink-0" />
                <span>Minimize</span>
              </>
            )}
          </Button>
        </div>
        <SidebarFooter collapsed={collapsed} onSignOut={handleSignOut} />
      </aside>
    </>
  );
}
