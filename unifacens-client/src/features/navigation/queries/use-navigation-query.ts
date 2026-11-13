import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import type {
  NavigationNetworkParams,
  NavigationRequest,
  NavigationAnchorPlan,
} from "shared";
import {
  calculateNavigationRoute,
  fetchNavigationNetworks,
  fetchNavigationVersion,
  calculateAnchorNavigationRoute,
} from "../services/navigation-api";

export const navigationKeys = {
  all: ["navigation"] as const,
  networks: () => [...navigationKeys.all, "networks"] as const,
  version: (network: NavigationNetworkParams) =>
    [...navigationKeys.all, "version", network] as const,
};
export function useNavigationNetworksQuery() {
  return useInfiniteQuery({
    queryKey: navigationKeys.networks(),
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      fetchNavigationNetworks(pageParam, signal),
    getNextPageParam: (last) => last.nextOffset ?? undefined,
  });
}
export function useNavigationVersionQuery(
  network: NavigationNetworkParams,
  enabled = true,
) {
  return useQuery({
    queryKey: navigationKeys.version(network),
    queryFn: ({ signal }) => fetchNavigationVersion(network, signal),
    staleTime: 0,
    enabled,
  });
}
export function useNavigationRouteMutation(network: NavigationNetworkParams) {
  return useMutation({
    mutationFn: (input: NavigationRequest) =>
      calculateNavigationRoute(network, input),
    retry: false,
  });
}
export function useAnchorNavigationRouteMutation() {
  return useMutation({
    mutationFn: (input: NavigationAnchorPlan) =>
      calculateAnchorNavigationRoute(input.network, input.request),
    retry: false,
  });
}
