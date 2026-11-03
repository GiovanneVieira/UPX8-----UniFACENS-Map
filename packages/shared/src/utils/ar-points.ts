/**
 * Verifica se um ponto 3D cartesiano é utilizável para projeção AR:
 * tupla válida de números finitos e não colapsada na origem (< 5mm de raio),
 * o que indicaria dado inválido/ausente vindo da API ou do ARCore.
 */
export function isUsablePoint(
  p?: [number, number, number] | number[] | null,
): p is [number, number, number] {
  return Boolean(
    Array.isArray(p) &&
      p.length >= 3 &&
      p.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
      !(Math.abs(p[0]) < 0.005 && Math.abs(p[1]) < 0.005 && Math.abs(p[2]) < 0.005),
  );
}
