import type { SelectionControlProps } from "./selection-control";

/** Controles HTML preservam Espaço, setas e foco nativos do navegador. */
export function SelectionControl({
  kind,
  label,
  groupName,
  checked,
  onSelect,
  className,
  children,
}: SelectionControlProps) {
  return (
    <label
      className={`flex cursor-pointer flex-row items-center gap-3 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-sky-300 ${className}`}
    >
      <input
        type={kind}
        name={groupName}
        checked={checked}
        onChange={onSelect}
        aria-label={label}
        className="h-5 w-5 shrink-0 accent-sky-300"
      />
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  );
}
