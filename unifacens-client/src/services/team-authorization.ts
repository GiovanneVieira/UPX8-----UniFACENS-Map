import { useTeamAccessStore } from "@/stores/use-team-access-store";

export function getTeamAuthorization(): Record<string, string> {
  const token = useTeamAccessStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
