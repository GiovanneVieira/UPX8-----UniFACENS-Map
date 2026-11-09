import { Text, View } from "react-native";
import { navigationPlanFormSchema, type NavigationGraph } from "shared";
import { useNavigationPlan } from "../hooks/use-navigation-plan";
import { MobilityFields } from "./mobility-fields";
import { NodePicker } from "./node-picker";
import { FieldErrors, PlanningButton, PlanningNotice } from "./planning-ui";
import { RoutePreview } from "./route-preview";

export function NavigationPlanForm({ graph }: { graph: NavigationGraph }) {
  const plan = useNavigationPlan(graph);
  const destinations = graph.nodes.filter(
    (node) => node.kind === "building_access",
  );
  if (!destinations.length)
    return (
      <PlanningNotice>
        <Text className="text-slate-200">
          Esta área ainda não tem acessos a prédios disponíveis. Escolha outra
          área ou aguarde o cadastro dos acessos.
        </Text>
      </PlanningNotice>
    );
  return (
    <View className="gap-6">
      {graph.dataSource === "demo" ? (
        <PlanningNotice>
          <Text className="font-semibold text-amber-200">
            Área de demonstração · dados fictícios
          </Text>
          <Text className="text-slate-200">
            Ao calcular, você fará uma simulação. Os pontos e as medidas não
            representam os caminhos reais da faculdade.
          </Text>
        </PlanningNotice>
      ) : null}
      <View className="gap-5 rounded-2xl border border-slate-700 bg-slate-900 p-5">
        <Text
          accessibilityRole="header"
          className="text-xl font-semibold text-white"
        >
          De onde para onde?
        </Text>
        <Text className="text-sm text-slate-300">
          Selecione pontos cadastrados. A chegada é no acesso ao prédio.
        </Text>
        <plan.form.Field name="originNodeId">
          {(field) => (
            <View className="gap-2">
              <NodePicker
                label="Ponto de partida"
                nodes={graph.nodes}
                value={field.state.value}
                onChange={field.handleChange}
              />
              {field.state.meta.isTouched ? (
                <FieldErrors errors={field.state.meta.errors} />
              ) : null}
            </View>
          )}
        </plan.form.Field>
        <plan.form.Field name="destinationNodeId">
          {(field) => (
            <View className="gap-2">
              <NodePicker
                label="Acesso de chegada"
                nodes={destinations}
                value={field.state.value}
                onChange={field.handleChange}
              />
              {field.state.meta.isTouched ? (
                <FieldErrors errors={field.state.meta.errors} />
              ) : null}
            </View>
          )}
        </plan.form.Field>
      </View>
      <MobilityFields plan={plan} />
      <plan.form.Subscribe
        selector={(state) => [state.values, state.isSubmitting] as const}
      >
        {([values, isSubmitting]) => {
          const parsed = navigationPlanFormSchema.safeParse(values);
          const request = parsed.success
            ? {
                ...parsed.data,
                mode:
                  graph.dataSource === "demo" ? "demonstration" : "navigation",
              }
            : null;
          // Só a resposta das escolhas atuais pode reaparecer, inclusive durante pedidos concorrentes.
          const current =
            request &&
            JSON.stringify(request) === JSON.stringify(plan.mutation.variables);
          return (
            <View className="gap-5">
              {!parsed.success ? (
                <Text
                  accessibilityLiveRegion="polite"
                  className="text-sm text-slate-300"
                >
                  Escolha partida e chegada e confira os valores opcionais para
                  calcular.
                </Text>
              ) : null}
              <PlanningButton
                onPress={() => void plan.form.handleSubmit()}
                disabled={isSubmitting || plan.mutation.isPending}
              >
                {isSubmitting
                  ? "Calculando percurso…"
                  : graph.dataSource === "demo"
                    ? "Simular percurso"
                    : "Calcular percurso"}
              </PlanningButton>
              {plan.mutation.isPending ? (
                <Text
                  accessibilityLiveRegion="polite"
                  className="text-slate-200"
                >
                  Consultando caminhos com as suas necessidades…
                </Text>
              ) : null}
              {current && plan.mutation.isError ? (
                <PlanningNotice>
                  <Text accessibilityRole="alert" className="text-rose-200">
                    {plan.mutation.error.message}
                  </Text>
                  <Text className="text-sm text-slate-300">
                    Suas escolhas foram preservadas. Tente calcular novamente ou
                    atualize as áreas.
                  </Text>
                </PlanningNotice>
              ) : null}
              {current && plan.mutation.data ? (
                <RoutePreview result={plan.mutation.data} graph={graph} />
              ) : null}
              {!current && plan.mutation.data ? (
                <Text
                  accessibilityLiveRegion="polite"
                  className="text-slate-200"
                >
                  Suas escolhas mudaram. Calcule novamente para obter uma prévia
                  atualizada.
                </Text>
              ) : null}
            </View>
          );
        }}
      </plan.form.Subscribe>
    </View>
  );
}
