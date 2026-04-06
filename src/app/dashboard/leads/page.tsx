import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { LeadsPageClient } from "./leads-client";

export default function LeadsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <LeadsPageClient />
    </Suspense>
  );
}
