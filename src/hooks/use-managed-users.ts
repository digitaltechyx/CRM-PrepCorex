"use client";

import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import type { UserProfile } from "@/types";
import { hasRole, getSubAdminManagedUserIds } from "@/lib/permissions";

/**
 * For admin dashboard: returns users the current user can manage.
 * - Super admin: all users (managedUserIds = null, managedUsers = all except self).
 * - Sub admin: only assigned users + users with matching locations (managedUserIds set, managedUsers filtered).
 */
export function useManagedUsers() {
  const { userProfile } = useAuth();
  const { data: users, loading } = useCollection<UserProfile>("users");

  const isSubAdmin = Boolean(userProfile && hasRole(userProfile, "sub_admin") && !hasRole(userProfile, "admin"));
  const isSuperAdmin = Boolean(userProfile && hasRole(userProfile, "admin"));

  const managedUserIds = useMemo(
    () => getSubAdminManagedUserIds(userProfile ?? undefined, users),
    [userProfile, users]
  );

  const managedUsers = useMemo(() => {
    const excludeSelf = (userProfile?.uid)
      ? users.filter((u) => u.uid !== userProfile.uid)
      : users;
    if (managedUserIds === null) return excludeSelf;
    return excludeSelf.filter((u) => u.uid && managedUserIds.includes(u.uid));
  }, [users, managedUserIds, userProfile?.uid]);

  return {
    users,
    loading,
    managedUserIds, // null = no filter (super admin), string[] = sub admin scope
    managedUsers,
    isSubAdmin,
    isSuperAdmin,
  };
}
