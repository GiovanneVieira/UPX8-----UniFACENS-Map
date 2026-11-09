import { Link } from 'expo-router';
import { useAuth } from '@/features/auth/hooks/use-auth';
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
  const { isAdmin } = useAuth();
  return (
    <Tabs className="flex-1 bg-slate-950">
      {isAdmin && (
        <View className="items-end bg-slate-950 px-5 py-2">
          <Link href="/admin" className="min-h-[44px] rounded-xl bg-blue-700 px-4 py-3 font-semibold text-white">
            Painel administrativo
          </Link>
        </View>
      )}
      <TabSlot className="h-full flex-1" />
      <TabList asChild>
        <View
          accessibilityRole="tablist"
          accessibilityLabel="Navegação principal"
          className="absolute bottom-3 w-11/12 max-w-lg self-center flex-row justify-center gap-3 rounded-2xl border border-slate-700 bg-slate-900 p-2"
        >
          <TabTrigger name="index" href="/" asChild>
            <TabButton>Início</TabButton>
          </TabTrigger>
          <TabTrigger name="campus" href="/campus" asChild>
            <TabButton>Campus</TabButton>
          </TabTrigger>
          <TabTrigger name="ar" href="/ar" asChild>
            <TabButton>AR</TabButton>
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
