import { useQuery } from "@tanstack/react-query";
import { useShallow } from "zustand/react/shallow";
import { useTeamAccessStore } from "@/stores/use-team-access-store";
import { fetchAccessPolicy } from "../services/access-api";

export const accessKeys = { policy: ["access", "policy"] as const };

export function useTeamAccess() {
  const policy = useQuery({
    queryKey: accessKeys.policy,
    queryFn: ({ signal }) => fetchAccessPolicy(signal),
  });
  const { authorized, signOut } = useTeamAccessStore(
    useShallow((state) => ({
      authorized: state.token !== null,
      signOut: state.signOut,
    })),
  );
  const requiresTeamAccess = policy.data?.requiresTeamAccess ?? true;
  return {
    policy,
    authorized,
    signOut,
    requiresTeamAccess,
    canEdit: authorized || !requiresTeamAccess,
  };
}
