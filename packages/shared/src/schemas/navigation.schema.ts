import { z } from "zod";

const identifier = z.string().trim().min(1).max(128);
const positiveMeters = z.number().finite().positive();
const percentage = z.number().finite().nonnegative();
const instant = z.string().datetime({ offset: true });

/** Coordenadas são opcionais no motor; distâncias vêm dos trechos medidos. */
export const navigationPositionSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("geographic"),
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
  }),
  z.strictObject({
    kind: z.literal("local"),
    referenceId: identifier,
    xMeters: z.number().finite(),
    yMeters: z.number().finite(),
  }),
]);

export const navigationNodeSchema = z.strictObject({
  id: identifier,
  name: z.string().trim().min(1).max(255),
  kind: z.enum(["gate", "junction", "building_access", "reference"]),
  position: navigationPositionSchema.nullable().default(null),
});
export type NavigationNode = z.infer<typeof navigationNodeSchema>;

export const navigationVerificationSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("unverified") }),
  z
    .strictObject({
      status: z.literal("verified"),
      verifiedAt: instant,
      validUntil: instant,
      evidenceIds: z.array(identifier).min(1),
    })
    .refine(
      (value) => Date.parse(value.verifiedAt) < Date.parse(value.validUntil),
      {
        message: "A validade deve terminar depois da verificação.",
        path: ["validUntil"],
      },
    ),
]);

export const navigationAvailabilitySchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("unknown") }),
  z.strictObject({ status: z.literal("closed") }),
  z
    .strictObject({
      status: z.literal("open"),
      checkedAt: instant,
      validUntil: instant,
    })
    .refine(
      (value) => Date.parse(value.checkedAt) < Date.parse(value.validUntil),
      {
        message: "A validade deve terminar depois da consulta operacional.",
        path: ["validUntil"],
      },
    ),
]);

/** Cada direção tem seu próprio registro. Inclinação positiva = subida. */
export const navigationEdgeSchema = z
  .strictObject({
    id: identifier,
    fromNodeId: identifier,
    toNodeId: identifier,
    kind: z.enum([
      "walkway",
      "footbridge",
      "ramp",
      "stairs",
      "elevator",
      "platform",
    ]),
    lengthMeters: positiveMeters,
    widthMeters: positiveMeters.nullable().default(null),
    longitudinalSlopePercent: z.number().finite().nullable().default(null),
    crossSlopePercent: percentage.nullable().default(null),
    stepCount: z.number().int().nonnegative().nullable().default(null),
    hasHandrail: z.boolean().nullable().default(null),
    hasTactilePaving: z.boolean().nullable().default(null),
    surface: z
      .enum(["firm_regular", "uneven", "loose"])
      .nullable()
      .default(null),
    verification: navigationVerificationSchema.default({
      status: "unverified",
    }),
    availability: navigationAvailabilitySchema.default({ status: "unknown" }),
  })
  .refine(
    (edge) =>
      edge.kind !== "stairs" || edge.stepCount === null || edge.stepCount > 0,
    {
      message: "Uma escada não pode ser registrada com zero degraus.",
      path: ["stepCount"],
    },
  );
export type NavigationEdge = z.infer<typeof navigationEdgeSchema>;

export const navigationGraphSchema = z
  .strictObject({
    id: identifier,
    version: identifier,
    dataSource: z.enum(["demo", "field_survey"]),
    nodes: z.array(navigationNodeSchema).min(1),
    edges: z.array(navigationEdgeSchema),
  })
  .superRefine((graph, context) => {
    const nodes = new Set<string>();
    const edges = new Set<string>();
    graph.nodes.forEach((node, index) => {
      if (nodes.has(node.id))
        context.addIssue({
          code: "custom",
          message: "ID de nó duplicado.",
          path: ["nodes", index, "id"],
        });
      nodes.add(node.id);
    });
    graph.edges.forEach((edge, index) => {
      if (edges.has(edge.id))
        context.addIssue({
          code: "custom",
          message: "ID de trecho duplicado.",
          path: ["edges", index, "id"],
        });
      edges.add(edge.id);
      for (const field of ["fromNodeId", "toNodeId"] as const) {
        if (!nodes.has(edge[field]))
          context.addIssue({
            code: "custom",
            message: "Nó do trecho não encontrado.",
            path: ["edges", index, field],
          });
      }
    });
  });
export type NavigationGraph = z.infer<typeof navigationGraphSchema>;

/** Valores são escolhas funcionais do usuário, sem limites normativos presumidos. */
export const navigationNeedsSchema = z.strictObject({
  stepFree: z.boolean().default(false),
  avoidLifts: z.boolean().default(false),
  minWidthMeters: positiveMeters.nullable().default(null),
  maxUphillSlopePercent: percentage.nullable().default(null),
  maxDownhillSlopePercent: percentage.nullable().default(null),
  maxCrossSlopePercent: percentage.nullable().default(null),
  requireHandrail: z.boolean().default(false),
  requireTactilePaving: z.boolean().default(false),
  requireFirmSurface: z.boolean().default(false),
});
export type NavigationNeeds = z.infer<typeof navigationNeedsSchema>;

/** Contrato novo do núcleo; não altera o endpoint legado /routing/route. */
export const navigationRequestSchema = z.strictObject({
  originNodeId: identifier,
  destinationNodeId: identifier,
  mode: z.enum(["navigation", "demonstration"]).default("navigation"),
  needs: navigationNeedsSchema.default(() => navigationNeedsSchema.parse({})),
});
export type NavigationRequest = z.infer<typeof navigationRequestSchema>;
export type NavigationRequestInput = z.input<typeof navigationRequestSchema>;

export const navigationExclusionReasonSchema = z.enum([
  "unverified",
  "verification_outdated",
  "closed",
  "availability_unknown",
  "availability_outdated",
  "steps_not_allowed",
  "step_count_unknown",
  "lifts_not_allowed",
  "width_unknown",
  "width_below_minimum",
  "longitudinal_slope_unknown",
  "uphill_slope_above_maximum",
  "downhill_slope_above_maximum",
  "cross_slope_unknown",
  "cross_slope_above_maximum",
  "handrail_unknown",
  "handrail_required",
  "tactile_paving_unknown",
  "tactile_paving_required",
  "surface_unknown",
  "firm_surface_required",
]);
export type NavigationExclusionReason = z.infer<
  typeof navigationExclusionReasonSchema
>;

export const navigationAssessmentSchema = z.strictObject({
  eligible: z.boolean(),
  reasons: z.array(navigationExclusionReasonSchema),
});
export type NavigationAssessment = z.infer<typeof navigationAssessmentSchema>;

const resultContext = {
  graphId: identifier,
  graphVersion: identifier,
  dataSource: z.enum(["demo", "field_survey"]),
  needs: navigationNeedsSchema,
};
export const navigationResultSchema = z.discriminatedUnion("status", [
  z.strictObject({
    ...resultContext,
    status: z.literal("ok"),
    nodeIds: z.array(identifier).min(1),
    edgeIds: z.array(identifier),
    distanceMeters: z.number().finite().nonnegative(),
  }),
  z.strictObject({
    ...resultContext,
    status: z.enum([
      "no_route",
      "insufficient_data",
      "node_not_found",
      "demo_not_allowed",
    ]),
    excludedEdges: z.array(
      z.strictObject({
        edgeId: identifier,
        reasons: z.array(navigationExclusionReasonSchema).min(1),
      }),
    ),
  }),
]);
export type NavigationResult = z.infer<typeof navigationResultSchema>;
