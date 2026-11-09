import { z } from "zod";
import { navigationRequestSchema } from "./navigation.schema.js";

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
export const navigationPlanFormSchema = z
  .strictObject({
    originNodeId: z.string().trim().min(1, "Escolha o ponto de partida."),
    destinationNodeId: z.string().trim().min(1, "Escolha o acesso de chegada."),
    stepFree: z.boolean(),
    avoidLifts: z.boolean(),
    requireHandrail: z.boolean(),
    requireTactilePaving: z.boolean(),
    requireFirmSurface: z.boolean(),
    minWidthMeters: optionalMeasure(true),
    maxUphillSlopePercent: optionalMeasure(false),
    maxDownhillSlopePercent: optionalMeasure(false),
    maxCrossSlopePercent: optionalMeasure(false),
  })
  .transform(({ originNodeId, destinationNodeId, ...needs }) =>
    navigationRequestSchema.parse({ originNodeId, destinationNodeId, needs }),
  );
export type NavigationPlanFormValues = z.input<typeof navigationPlanFormSchema>;
