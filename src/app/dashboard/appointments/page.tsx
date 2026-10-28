import { Suspense } from "react";
import { AppointmentsAdminClient } from "@/components/crm/appointments/appointments-admin-client";
import { Loader2 } from "lucide-react";

export default function AppointmentsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <AppointmentsAdminClient />
    </Suspense>
  );
}
