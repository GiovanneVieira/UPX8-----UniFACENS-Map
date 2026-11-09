import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

export interface SelectionControlProps {
  kind: "checkbox" | "radio";
  label: string;
  groupName: string;
  checked: boolean;
  onSelect: () => void;
  className: string;
  children: ReactNode;
}

export function SelectionControl({
  kind,
  label,
  checked,
  onSelect,
  className,
  children,
}: SelectionControlProps) {
  return (
    <Pressable
      accessibilityRole={kind}
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      onPress={onSelect}
      className={`flex-row items-center gap-3 ${className}`}
    >
      <Text accessible={false} className="text-lg text-sky-200">
        {kind === "checkbox" ? (checked ? "☑" : "☐") : checked ? "●" : "○"}
      </Text>
      <View className="min-w-0 flex-1">{children}</View>
    </Pressable>
  );
}
