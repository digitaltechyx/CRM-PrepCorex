"use client";

import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, DollarSign } from "lucide-react";
import { InvoiceManagement } from "@/components/admin/invoice-management";
import { useManagedUsers } from "@/hooks/use-managed-users";
import type { UserProfile } from "@/types";

export default function CrmInvoicesPage() {
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get("tab") as "pending" | "paid" | null;
  const { managedUsers: users } = useManagedUsers();

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-2 shadow-xl">
        <CardHeader className="bg-gradient-to-r from-indigo-500 to-blue-600 pb-4 text-white">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-2xl font-bold text-white">
                <FileText className="h-6 w-6" />
                Invoice management
              </CardTitle>
              <CardDescription className="mt-2 text-indigo-100">
                View and manage invoices across users
              </CardDescription>
            </div>
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
              <DollarSign className="h-7 w-7 text-white" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="p-6">
            <InvoiceManagement users={users as UserProfile[]} initialTab={tabFromUrl} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
