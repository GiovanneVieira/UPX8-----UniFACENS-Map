import type { ReactNode } from "react";
import { Text, View } from "react-native";
import type { NavigationNetworkSummary } from "shared";
import type { NavigationPlan } from "../hooks/use-navigation-plan";
import { SelectionControl } from "./selection-control";
import { PlanningNotice, FieldErrors } from "./planning-ui";

export function NetworkChoices({
  plan,
  networks,
  children,
}: {
  plan: NavigationPlan;
  networks: NavigationNetworkSummary[];
  children: ReactNode;
}) {
  return (
    <View className="gap-3">
      <Text
        accessibilityRole="header"
        className="text-xl font-semibold text-white"
      >
        Caminhos disponíveis
      </Text>
      <Text className="text-sm text-slate-300">
        Os locais vêm dos pontos AR. Para calcular, escolha uma área com os
        caminhos publicados entre eles.
      </Text>
      <plan.form.Field name="networkKey">
        {(field) => (
          <View className="gap-3">
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel="Área de planejamento"
              className="gap-3"
            >
              {networks.map((network) => {
                const key = `${network.networkId}/${network.version}`;
                return (
                  <SelectionControl
                    key={key}
                    kind="radio"
                    groupName="navigation-network"
                    label={`${network.dataSource === "demo" ? "Demonstração · dados fictícios" : "Percursos do campus"} · ${network.networkId} · versão ${network.version}`}
                    checked={field.state.value === key}
                    onSelect={() => {
                      field.handleChange(key);
                      plan.form.setFieldValue(
                        "mode",
                        network.dataSource === "demo"
                          ? "demonstration"
                          : "navigation",
                      );
                    }}
                    className={`min-h-[48px] rounded-xl border p-4 active:opacity-80 ${field.state.value === key ? "border-sky-300 bg-blue-950" : "border-slate-600 bg-slate-900"}`}
                  >
                    <View className="gap-1">
                      <Text className="font-semibold text-white">
                        {network.dataSource === "demo"
                          ? "Demonstração · dados fictícios"
                          : "Percursos do campus"}
                      </Text>
                      <Text className="text-sm text-slate-300">
                        {network.networkId} · versão {network.version}
                      </Text>
                    </View>
                  </SelectionControl>
                );
              })}
            </View>
            {field.state.meta.isTouched ? (
              <FieldErrors errors={field.state.meta.errors} />
            ) : null}
          </View>
        )}
      </plan.form.Field>
      {children}
      <plan.form.Subscribe selector={(state) => state.values.mode}>
        {(mode) =>
          mode === "demonstration" ? (
            <PlanningNotice>
              <Text className="font-semibold text-amber-200">
                Simulação · dados fictícios
              </Text>
              <Text className="text-slate-200">
                Os caminhos e as medidas desta área não representam percursos
                reais do campus.
              </Text>
            </PlanningNotice>
          ) : null
        }
      </plan.form.Subscribe>
    </View>
  );
}
