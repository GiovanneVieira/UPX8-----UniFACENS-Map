import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  type TabTriggerSlotProps,
} from "expo-router/ui";
import { Pressable, Text, View } from "react-native";
import { cssInterop } from "nativewind";

// TabSlot consome apenas style; converte as classes antes de alcançar o SDK.
cssInterop(TabSlot, { className: "style" });

export default function AppTabs() {
  return (
    <Tabs className="flex-1 bg-slate-950">
      <TabSlot className="h-full flex-1" />
      <TabList asChild>
        <View
          accessibilityRole="tablist"
          accessibilityLabel="Navegação principal"
          className="absolute bottom-3 w-11/12 max-w-lg self-center flex-row justify-center gap-3 rounded-2xl border border-slate-700 bg-slate-900 p-2"
        >
          <TabTrigger name="home" href="/" asChild>
            <TabButton>Campus</TabButton>
          </TabTrigger>
          <TabTrigger name="ar" href="/ar" asChild>
            <TabButton>Realidade aumentada</TabButton>
          </TabTrigger>
        </View>
      </TabList>
    </Tabs>
  );
}

function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  return (
    <Pressable
      {...props}
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      className={`min-h-[44px] flex-1 items-center justify-center rounded-xl px-3 active:opacity-80 ${isFocused ? "bg-blue-700" : "bg-slate-800"}`}
    >
      <Text className="text-center text-sm font-semibold text-white">
        {children}
      </Text>
    </Pressable>
  );
}
