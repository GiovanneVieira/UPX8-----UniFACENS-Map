import type { PropsWithChildren } from "react";
import { Pressable, Text, View } from "react-native";

export function PlanningButton({
  children,
  onPress,
  disabled = false,
}: PropsWithChildren<{
  onPress: () => void;
  disabled?: boolean;
}>) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      className={`min-h-[48px] items-center justify-center rounded-xl border border-sky-400 px-4 py-3 active:opacity-80 ${disabled ? "bg-slate-800 opacity-60" : "bg-blue-700"}`}
    >
      <Text className="text-center font-semibold text-white">{children}</Text>
    </Pressable>
  );
}
export function PlanningNotice({ children }: PropsWithChildren) {
  return (
    <View
      accessibilityLiveRegion="polite"
      className="gap-3 rounded-2xl border border-slate-600 bg-slate-900 p-4"
    >
      {children}
    </View>
  );
}
export function FieldErrors({ errors }: { errors: readonly unknown[] }) {
  const messages = errors.flatMap((error) => {
    if (typeof error === "string") return [error];
    if (error && typeof error === "object" && "message" in error)
      return [String(error.message)];
    return [];
  });
  return messages.length ? (
    <Text accessibilityRole="alert" className="text-sm text-rose-200">
      {[...new Set(messages)].join(" ")}
    </Text>
  ) : null;
}
