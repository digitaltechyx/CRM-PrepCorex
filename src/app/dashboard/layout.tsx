"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { canAccessCrm } from "@/lib/crm-access";
import { CrmSidebar } from "@/components/crm/crm-sidebar";

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
    <div className="flex min-h-screen w-full">
      <CrmSidebar />
      <main className="min-h-screen flex-1 overflow-auto bg-background p-4 sm:p-6">{children}</main>
    </div>
  );
}
