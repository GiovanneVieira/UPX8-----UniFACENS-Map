import { useForm } from "@tanstack/react-form";
import {
  navigationAnchorPlanFormSchema,
  type NavigationAnchorPlanFormValues,
} from "shared";
import { useAnchorNavigationRouteMutation } from "../queries/use-navigation-query";

const defaults: NavigationAnchorPlanFormValues = {
  originAnchorId: "",
  destinationAnchorId: "",
  networkKey: "",
  mode: "navigation",
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
export function useNavigationPlan() {
  const mutation = useAnchorNavigationRouteMutation();
  const form = useForm({
    defaultValues: defaults,
    listeners: { onChange: () => mutation.reset() },
    validators: {
      onChange: navigationAnchorPlanFormSchema,
      onSubmit: navigationAnchorPlanFormSchema,
    },
    onSubmit: async ({ value }) => {
      try {
        await mutation.mutateAsync(navigationAnchorPlanFormSchema.parse(value));
      } catch {
        /* A mutation mantém o erro e o formulário para nova tentativa. */
      }
    },
  });
  return { form, mutation };
}
export type NavigationPlan = ReturnType<typeof useNavigationPlan>;
