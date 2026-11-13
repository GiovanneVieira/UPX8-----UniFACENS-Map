import { z } from "zod";
import { navigationRequestSchema } from "./navigation.schema.js";
import {
  navigationAnchorRequestSchema,
  navigationNetworkParamsSchema,
} from "./navigation-api.schema.js";

function optionalMeasure(positive: boolean) {
  return z
    .string()
    .trim()
    .refine(
      (value) => value === "" || /^\d+(?:[.,]\d+)?$/.test(value),
      "Informe um número, usando ponto ou vírgula decimal.",
    )
    .transform((value) =>
      value === "" ? null : Number(value.replace(",", ".")),
    )
    .pipe(
      (positive
        ? z.number().finite().positive("Informe um valor maior que zero.")
        : z.number().finite().nonnegative("Informe zero ou um valor positivo.")
      ).nullable(),
    );
}

/** Entrada textual do formulário; campos vazios não criam limites presumidos. */
const needsFields = {
  stepFree: z.boolean(),
  avoidLifts: z.boolean(),
  requireHandrail: z.boolean(),
  requireTactilePaving: z.boolean(),
  requireFirmSurface: z.boolean(),
  minWidthMeters: optionalMeasure(true),
  maxUphillSlopePercent: optionalMeasure(false),
  maxDownhillSlopePercent: optionalMeasure(false),
  maxCrossSlopePercent: optionalMeasure(false),
};
export const navigationPlanFormSchema = z
  .strictObject({
    originNodeId: z.string().trim().min(1, "Escolha o ponto de partida."),
    destinationNodeId: z.string().trim().min(1, "Escolha o acesso de chegada."),
    ...needsFields,
  })
  .transform(({ originNodeId, destinationNodeId, ...needs }) =>
    navigationRequestSchema.parse({ originNodeId, destinationNodeId, needs }),
  );
export type NavigationPlanFormValues = z.input<typeof navigationPlanFormSchema>;

export const navigationAnchorPlanFormSchema = z
  .strictObject({
    originAnchorId: z.string().uuid("Escolha o ponto AR de partida."),
    destinationAnchorId: z.string().uuid("Escolha o ponto AR de chegada."),
    networkKey: z.string().refine((key) => {
      const parts = key.split("/");
      return (
        parts.length === 2 &&
        navigationNetworkParamsSchema.safeParse({
          networkId: parts[0],
          version: parts[1],
        }).success
      );
    }, "Escolha uma área de percursos publicada."),
    mode: z.enum(["navigation", "demonstration"]),
    ...needsFields,
  })
  .transform(
    ({ originAnchorId, destinationAnchorId, networkKey, mode, ...needs }) => {
      const [networkId, version] = networkKey.split("/");
      return {
        network: navigationNetworkParamsSchema.parse({ networkId, version }),
        request: navigationAnchorRequestSchema.parse({
          origin: { anchorId: originAnchorId },
          destination: { anchorId: destinationAnchorId },
          mode,
          needs,
        }),
      };
    },
  );
export type NavigationAnchorPlanFormValues = z.input<
  typeof navigationAnchorPlanFormSchema
>;
export type NavigationAnchorPlan = z.infer<
  typeof navigationAnchorPlanFormSchema
>;
