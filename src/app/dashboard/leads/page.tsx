import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";

export default function CrmLeadsPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Lead management
        </CardTitle>
        <CardDescription>
          This module will hold your sales pipeline (stages, owners, conversion to customers). Scaffold only —
          we can design Firestore collections next.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        <p>No data yet. Tell your team what fields and workflow you need (e.g. source, stage, value, next step).</p>
      </CardContent>
    </Card>
  );
}
