import { z } from "zod";
import {
  navigationGraphSchema,
  navigationRequestSchema,
  navigationResultSchema,
  navigationNeedsSchema,
} from "./navigation.schema.js";

const networkKey = z
  .string()
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/,
    "Use letras, números, ponto, hífen ou sublinhado.",
  );
const instant = z.string().datetime({ offset: true });

export const navigationNetworkParamsSchema = z.strictObject({
  networkId: networkKey,
  version: networkKey,
});
export type NavigationNetworkParams = z.infer<
  typeof navigationNetworkParamsSchema
>;

/** Limites permitem inserções em lote dentro do limite de parâmetros do PostgreSQL. */
export const importNavigationNetworkSchema = navigationGraphSchema.superRefine(
  (graph, context) => {
    for (const [field, value] of [
      ["id", graph.id],
      ["version", graph.version],
    ] as const) {
      if (!networkKey.safeParse(value).success)
        context.addIssue({
          code: "custom",
          path: [field],
          message: "Identificador inválido para a API.",
        });
    }
    for (const field of ["nodes", "edges"] as const) {
      if (graph[field].length > 1000)
        context.addIssue({
          code: "custom",
          path: [field],
          message: "Máximo de 1000 registros por versão.",
        });
    }
  },
);
export type ImportNavigationNetworkDto = z.infer<
  typeof importNavigationNetworkSchema
>;

export const publishNavigationNetworkSchema = z.strictObject({
  review: z
    .strictObject({
      evidenceIds: z.array(z.string().trim().min(1).max(128)).min(1).max(100),
      validUntil: instant,
    })
    .optional(),
});
export type PublishNavigationNetworkDto = z.infer<
  typeof publishNavigationNetworkSchema
>;

export const navigationNetworksQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
});
export type NavigationNetworksQuery = z.infer<
  typeof navigationNetworksQuerySchema
>;

const summary = {
  networkId: networkKey,
  version: networkKey,
  dataSource: z.enum(["demo", "field_survey"]),
  status: z.enum(["draft", "published", "retired"]),
  nodeCount: z.number().int().nonnegative(),
  edgeCount: z.number().int().nonnegative(),
  createdAt: instant,
  publishedAt: instant.nullable(),
  retiredAt: instant.nullable(),
};
export const navigationNetworkSummarySchema = z.strictObject(summary);
export type NavigationNetworkSummary = z.infer<
  typeof navigationNetworkSummarySchema
>;
export const navigationNetworkVersionSchema = z.strictObject({
  ...summary,
  graph: navigationGraphSchema,
});
export type NavigationNetworkVersion = z.infer<
  typeof navigationNetworkVersionSchema
>;
export const navigationNetworksPageSchema = z.strictObject({
  items: z.array(navigationNetworkSummarySchema),
  nextOffset: z.number().int().nonnegative().nullable(),
});
export type NavigationNetworksPage = z.infer<
  typeof navigationNetworksPageSchema
>;

const anchorReference = z.strictObject({ anchorId: z.string().uuid() });
export const navigationAnchorRequestSchema = navigationRequestSchema
  .pick({ mode: true, needs: true })
  .extend({
    origin: z.union([
      anchorReference,
      z.strictObject({ nodeId: z.string().trim().min(1).max(128) }),
    ]),
    destination: anchorReference,
  });
export type NavigationAnchorRequest = z.infer<
  typeof navigationAnchorRequestSchema
>;

export const navigationAnchorResultSchema = z.union([
  navigationResultSchema,
  z.strictObject({
    status: z.literal("anchor_not_in_network"),
    graphId: networkKey,
    graphVersion: networkKey,
    dataSource: z.enum(["demo", "field_survey"]),
    needs: navigationNeedsSchema,
    unmappedAnchorIds: z.array(z.string().uuid()).min(1),
  }),
]);
export type NavigationAnchorResult = z.infer<
  typeof navigationAnchorResultSchema
>;
