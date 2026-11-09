import { useForm } from "@tanstack/react-form";
import {
  navigationPlanFormSchema,
  type NavigationGraph,
  type NavigationPlanFormValues,
} from "shared";
import { useNavigationRouteMutation } from "../queries/use-navigation-query";

export const navigationPlanDefaults: NavigationPlanFormValues = {
  originNodeId: "",
  destinationNodeId: "",
  stepFree: false,
  avoidLifts: false,
  requireHandrail: false,
  requireTactilePaving: false,
  requireFirmSurface: false,
  minWidthMeters: "",
  maxUphillSlopePercent: "",
  maxDownhillSlopePercent: "",
  maxCrossSlopePercent: "",
};

export function useNavigationPlan(graph: NavigationGraph) {
  const mutation = useNavigationRouteMutation({
    networkId: graph.id,
    version: graph.version,
  });
  const form = useForm({
    defaultValues: navigationPlanDefaults,
    listeners: { onChange: () => mutation.reset() },
    validators: {
      onChange: navigationPlanFormSchema,
      onSubmit: navigationPlanFormSchema,
    },
    onSubmit: async ({ value }) => {
      const request = navigationPlanFormSchema.parse(value);
      request.mode =
        graph.dataSource === "demo" ? "demonstration" : "navigation";
      try {
        await mutation.mutateAsync(request);
      } catch {
        // A mutação preserva o erro para nova tentativa, sem perder o formulário.
      }
    },
  });
  return { form, mutation };
}
export type NavigationPlan = ReturnType<typeof useNavigationPlan>;
