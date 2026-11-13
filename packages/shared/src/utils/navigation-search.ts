function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

/** Busca textual mantém a identidade e a ordem dos locais AR. */
export function filterNavigationPoints<
  T extends { name: string; description?: string | null },
>(points: readonly T[], search: string): T[] {
  const term = normalize(search);
  return points.filter(
    (point) =>
      normalize(point.name).includes(term) ||
      normalize(point.description ?? "").includes(term),
  );
}
