import type { ReactNode } from "react";
import { Text, View } from "react-native";
import {
  navigationAnchorPlanFormSchema,
  type Anchor,
  type NavigationNetworkSummary,
} from "shared";
import { useNavigationPlan } from "../hooks/use-navigation-plan";
import { MobilityFields } from "./mobility-fields";
import { NodePicker } from "./node-picker";
import { FieldErrors, PlanningButton, PlanningNotice } from "./planning-ui";
import { NetworkChoices } from "./network-choices";
import { AnchorRouteResult } from "./anchor-route-result";

export function NavigationPlanForm({
  anchors,
  networks,
  networkControls,
}: {
  anchors: Anchor[];
  networks: NavigationNetworkSummary[];
  networkControls: ReactNode;
}) {
  const plan = useNavigationPlan();
  return (
    <View className="gap-6">
      <View className="gap-5 rounded-2xl border border-slate-700 bg-slate-900 p-5">
        <Text
          accessibilityRole="header"
          className="text-xl font-semibold text-white"
        >
          De onde para onde?
        </Text>
        <Text className="text-sm text-slate-300">
          Escolha os locais já cadastrados como pontos AR. Você pode buscar pelo
          nome ou pelas referências preenchidas no cadastro.
        </Text>
        {(
          [
            ["originAnchorId", "Ponto de partida"],
            ["destinationAnchorId", "Ponto de chegada"],
          ] as const
        ).map(([name, label]) => (
          <plan.form.Field key={name} name={name}>
            {(field) => (
              <View className="gap-2">
                <NodePicker
                  label={label}
                  nodes={anchors}
                  value={field.state.value}
                  onChange={field.handleChange}
                />
                {field.state.meta.isTouched ? (
                  <FieldErrors errors={field.state.meta.errors} />
                ) : null}
              </View>
            )}
          </plan.form.Field>
        ))}
        <Text className="text-sm text-slate-300">
          O ponto AR representa o próprio local. Encontrá-lo na busca não exige
          abrir a câmera.
        </Text>
      </View>
      <NetworkChoices plan={plan} networks={networks}>
        {networkControls}
      </NetworkChoices>
      <MobilityFields plan={plan} />
      <plan.form.Subscribe
        selector={(state) => [state.values, state.isSubmitting] as const}
      >
        {([values, isSubmitting]) => {
          const parsed = navigationAnchorPlanFormSchema.safeParse(values);
          const networkExists = networks.some(
            (network) =>
              network.networkId + "/" + network.version === values.networkKey,
          );
          const selectionExists =
            anchors.some((anchor) => anchor.id === values.originAnchorId) &&
            anchors.some((anchor) => anchor.id === values.destinationAnchorId);
          const current =
            selectionExists &&
            networkExists &&
            parsed.success &&
            JSON.stringify(parsed.data) ===
              JSON.stringify(plan.mutation.variables);
          return (
            <View className="gap-5">
              {!parsed.success || !selectionExists ? (
                <Text
                  accessibilityLiveRegion="polite"
                  className="text-sm text-slate-300"
                >
                  Escolha os pontos AR, uma área de percursos e confira os
                  valores opcionais para calcular.
                </Text>
              ) : null}
              <PlanningButton
                onPress={() => void plan.form.handleSubmit()}
                disabled={
                  isSubmitting ||
                  plan.mutation.isPending ||
                  !networkExists ||
                  (!!values.originAnchorId &&
                    !!values.destinationAnchorId &&
                    !selectionExists)
                }
              >
                {isSubmitting
                  ? "Calculando percurso…"
                  : values.mode === "demonstration"
                    ? "Simular percurso"
                    : "Calcular percurso"}
              </PlanningButton>
              {isSubmitting ? (
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
                    Suas escolhas foram preservadas. Tente novamente ou atualize
                    os pontos e os caminhos.
                  </Text>
                </PlanningNotice>
              ) : null}
              {current && plan.mutation.data && parsed.success ? (
                <AnchorRouteResult
                  key={values.networkKey + "/" + plan.mutation.submittedAt}
                  result={plan.mutation.data}
                  network={parsed.data.network}
                  anchors={anchors}
                />
              ) : null}
            </View>
          );
        }}
      </plan.form.Subscribe>
    </View>
  );
}
