import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BookUser } from "lucide-react";

export default function CrmContactsPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookUser className="h-5 w-5" />
          Address book
        </CardTitle>
        <CardDescription>
          Contacts and organizations — scaffold for the CRM. Can later sync with quote/invoice “sold to” parties.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        <p>No data yet. We can model people, companies, addresses, and links to Firebase users.</p>
      </CardContent>
    </Card>
  );
}
