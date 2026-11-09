import {
  navigationEdgeSchema,
  navigationNeedsSchema,
  type NavigationEdge,
  type NavigationNeeds,
  type NavigationAssessment,
  type NavigationExclusionReason,
} from "../schemas/navigation.schema.js";

export const NAVIGATION_REASON_LABELS: Record<
  NavigationExclusionReason,
  string
> = {
  unverified: "Trecho ainda não conferido.",
  verification_outdated: "Verificação fora do período de validade.",
  closed: "Trecho interditado.",
  availability_unknown: "Disponibilidade desconhecida.",
  availability_outdated: "Disponibilidade precisa ser atualizada.",
  steps_not_allowed: "O trecho contém escada ou degraus.",
  step_count_unknown: "Presença de degraus não conferida.",
  lifts_not_allowed: "O trecho depende de elevador ou plataforma.",
  width_unknown: "Largura livre não informada.",
  width_below_minimum: "Largura livre menor que a solicitada.",
  longitudinal_slope_unknown: "Inclinação longitudinal não informada.",
  uphill_slope_above_maximum: "Subida maior que o limite solicitado.",
  downhill_slope_above_maximum: "Descida maior que o limite solicitado.",
  cross_slope_unknown: "Inclinação transversal não informada.",
  cross_slope_above_maximum:
    "Inclinação transversal maior que o limite solicitado.",
  handrail_unknown: "Presença de corrimão não conferida.",
  handrail_required: "O trecho não possui o corrimão solicitado.",
  tactile_paving_unknown: "Sinalização tátil do trecho não conferida.",
  tactile_paving_required:
    "O trecho não possui a sinalização tátil solicitada.",
  surface_unknown: "Condição do piso não informada.",
  firm_surface_required:
    "O trecho não possui o piso firme e regular solicitado.",
};

export function navigationEvaluationTime(instant: string): number {
  const time = Date.parse(instant);
  if (!Number.isFinite(time))
    throw new Error("Instante de avaliação inválido.");
  return time;
}

/** Informação ausente pode ser levantada; barreira conhecida não é relaxada. */
export function isNavigationDataGap(
  reason: NavigationExclusionReason,
): boolean {
  return (
    reason === "unverified" ||
    reason.endsWith("_unknown") ||
    reason.endsWith("_outdated")
  );
}

/** Função pura: relógio injetado e nenhuma dependência de sensores ou banco. */
export function assessNavigationEdge(
  edgeInput: NavigationEdge,
  needsInput: NavigationNeeds,
  evaluatedAt: string,
): NavigationAssessment {
  const edge = navigationEdgeSchema.parse(edgeInput);
  const needs = navigationNeedsSchema.parse(needsInput);
  const now = navigationEvaluationTime(evaluatedAt);
  const reasons: NavigationExclusionReason[] = [];
  const { verification, availability } = edge;

  if (verification.status === "unverified") reasons.push("unverified");
  else if (
    now < Date.parse(verification.verifiedAt) ||
    now >= Date.parse(verification.validUntil)
  ) {
    reasons.push("verification_outdated");
  }
  if (availability.status === "closed") reasons.push("closed");
  else if (availability.status === "unknown")
    reasons.push("availability_unknown");
  else if (
    now < Date.parse(availability.checkedAt) ||
    now >= Date.parse(availability.validUntil)
  ) {
    reasons.push("availability_outdated");
  }

  if (needs.stepFree) {
    if (
      edge.kind === "stairs" ||
      (edge.stepCount !== null && edge.stepCount > 0)
    )
      reasons.push("steps_not_allowed");
    else if (edge.stepCount === null) reasons.push("step_count_unknown");
  }
  if (
    needs.avoidLifts &&
    (edge.kind === "elevator" || edge.kind === "platform")
  )
    reasons.push("lifts_not_allowed");
  if (needs.minWidthMeters !== null) {
    if (edge.widthMeters === null) reasons.push("width_unknown");
    else if (edge.widthMeters < needs.minWidthMeters)
      reasons.push("width_below_minimum");
  }
  if (
    needs.maxUphillSlopePercent !== null ||
    needs.maxDownhillSlopePercent !== null
  ) {
    const slope = edge.longitudinalSlopePercent;
    if (slope === null) reasons.push("longitudinal_slope_unknown");
    else {
      if (
        needs.maxUphillSlopePercent !== null &&
        Math.max(0, slope) > needs.maxUphillSlopePercent
      ) {
        reasons.push("uphill_slope_above_maximum");
      }
      if (
        needs.maxDownhillSlopePercent !== null &&
        Math.max(0, -slope) > needs.maxDownhillSlopePercent
      ) {
        reasons.push("downhill_slope_above_maximum");
      }
    }
  }
  if (needs.maxCrossSlopePercent !== null) {
    if (edge.crossSlopePercent === null) reasons.push("cross_slope_unknown");
    else if (edge.crossSlopePercent > needs.maxCrossSlopePercent)
      reasons.push("cross_slope_above_maximum");
  }
  if (needs.requireHandrail && edge.hasHandrail !== true)
    reasons.push(
      edge.hasHandrail === null ? "handrail_unknown" : "handrail_required",
    );
  if (needs.requireTactilePaving && edge.hasTactilePaving !== true)
    reasons.push(
      edge.hasTactilePaving === null
        ? "tactile_paving_unknown"
        : "tactile_paving_required",
    );
  if (needs.requireFirmSurface && edge.surface !== "firm_regular")
    reasons.push(
      edge.surface === null ? "surface_unknown" : "firm_surface_required",
    );

  return { eligible: reasons.length === 0, reasons };
}
