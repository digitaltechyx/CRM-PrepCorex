"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { canAccessCrm } from "@/lib/crm-access";
import { CrmSidebar } from "@/components/crm/crm-sidebar";
import { CrmLeadsProvider } from "@/contexts/crm-leads-context";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, userProfile, loading, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (userProfile && !canAccessCrm(userProfile)) {
      signOut().then(() => router.replace("/login"));
    }
  }, [user, userProfile, loading, router, signOut]);

  if (loading || !user || !userProfile || !canAccessCrm(userProfile)) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <CrmLeadsProvider>
      {/* h-dvh + overflow-hidden: viewport-fixed shell; only <main> scrolls — sidebar stays put */}
      <div className="flex h-dvh min-h-0 w-full max-w-full overflow-hidden">
        <CrmSidebar />
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-background p-4 sm:p-6">
          {children}
        </main>
      </div>
    </CrmLeadsProvider>
  );
}
