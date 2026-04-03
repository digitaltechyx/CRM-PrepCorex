import type { UserProfile } from "@/types";
import { hasFeature, hasRole } from "@/lib/permissions";

/** Who may use this CRM app (invoices / quotes / future leads & contacts). */
export function canAccessCrm(profile: UserProfile | null | undefined): boolean {
  if (!profile) return false;
  if (hasRole(profile, "admin")) return true;
  if (hasRole(profile, "sub_admin")) {
    return (
      hasFeature(profile, "manage_invoices") ||
      hasFeature(profile, "manage_quotes") ||
      hasFeature(profile, "admin_dashboard")
    );
  }
  return false;
}
