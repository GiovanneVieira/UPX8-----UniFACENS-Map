import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTeamAccess } from "../hooks/use-team-access";
import { TeamAccessModal } from "./team-access-modal";

export function TeamAccessPanel() {
  const access = useTeamAccess();
  const [open, setOpen] = useState(false);
  if (!access.requiresTeamAccess) return null;
  return (
    <View className="gap-3 rounded-2xl border border-slate-700 bg-slate-900 p-4 md:flex-row md:items-center md:justify-between">
      <Text
        accessibilityLiveRegion="polite"
        className="flex-1 text-sm text-slate-200"
      >
        {access.authorized
          ? "Acesso da equipe ativo para edição dos locais."
          : "Você pode consultar e cadastrar locais. A edição é reservada à equipe."}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => (access.authorized ? access.signOut() : setOpen(true))}
        className="min-h-[44px] self-start justify-center rounded-xl bg-slate-800 px-4 active:opacity-80"
      >
        <Text className="font-semibold text-white">
          {access.authorized ? "Sair do acesso da equipe" : "Acesso da equipe"}
        </Text>
      </Pressable>
      {open ? <TeamAccessModal onClose={() => setOpen(false)} /> : null}
    </View>
  );
}
