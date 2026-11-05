/**
 * A* 8-conectividade no grid caminhável + suavização (C3).
 * - Diagonal só permitida quando as duas ortogonais estão livres (sem cortar quina).
 * - Heurística euclidiana em metros.
 * - Suavização: line-of-sight simplification (greedy) + Douglas-Peucker leve.
 */

import {
  type WalkableGrid,
  cellToLatLng,
  snapToWalkable,
} from './grid-builder.js';

interface AStarNode {
  row: number;
  col: number;
  g: number; // custo acumulado em metros
  f: number; // g + heurística
  parent: AStarNode | null;
}

/** Distância euclidiana entre células em metros. */
function cellDistance(grid: WalkableGrid, r1: number, c1: number, r2: number, c2: number): number {
  const dr = Math.abs(r1 - r2);
  const dc = Math.abs(c1 - c2);
  return Math.sqrt(dr * dr + dc * dc) * grid.cellSizeM;
}

/** Executa A* no grid. Retorna lista de células do caminho (origem→destino). */
export function aStar(
  grid: WalkableGrid,
  startRow: number,
  startCol: number,
  endRow: number,
  endCol: number,
): Array<{ row: number; col: number }> | null {
  if (grid.blocked[startRow]![startCol] || grid.blocked[endRow]![endCol]) {
    return null;
  }

  const openList: AStarNode[] = [];
  const closed = new Set<string>();
  const key = (r: number, c: number) => `${r},${c}`;

  const startNode: AStarNode = {
    row: startRow,
    col: startCol,
    g: 0,
    f: cellDistance(grid, startRow, startCol, endRow, endCol),
    parent: null,
  };
  openList.push(startNode);

  const dirs = [
    [-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1],         // ortogonais (custo 1 célula)
    [-1, -1, 1.414], [-1, 1, 1.414], [1, -1, 1.414], [1, 1, 1.414], // diagonais (√2)
  ];

  while (openList.length > 0) {
    // Pega o nó com menor f (linear scan — grid pequeno, ok)
    let bestIdx = 0;
    for (let i = 1; i < openList.length; i++) {
      if (openList[i]!.f < openList[bestIdx]!.f) bestIdx = i;
    }
    const current = openList.splice(bestIdx, 1)[0]!;

    if (current.row === endRow && current.col === endCol) {
      // Reconstrói o caminho
      const path: Array<{ row: number; col: number }> = [];
      let node: AStarNode | null = current;
      while (node) {
        path.unshift({ row: node.row, col: node.col });
        node = node.parent;
      }
      return path;
    }

    closed.add(key(current.row, current.col));

    for (const [dr, dc, cost] of dirs) {
      const nr = current.row + dr!;
      const nc = current.col + dc!;
      if (nr < 0 || nr >= grid.rows || nc < 0 || nc >= grid.cols) continue;
      if (grid.blocked[nr]![nc]) continue;
      if (closed.has(key(nr, nc))) continue;

      // Proibição de corte de quina: diagonal só se ambas ortogonais livres
      if (dr !== 0 && dc !== 0) {
        if (grid.blocked[current.row]![nc] || grid.blocked[nr]![current.col]) continue;
      }

      const g = current.g + cost * grid.cellSizeM;
      const existing = openList.find((n) => n.row === nr && n.col === nc);
      if (existing && existing.g <= g) continue;

      const newNode: AStarNode = {
        row: nr,
        col: nc,
        g,
        f: g + cellDistance(grid, nr, nc, endRow, endCol),
        parent: current,
      };
      if (existing) {
        Object.assign(existing, newNode);
      } else {
        openList.push(newNode);
      }
    }
  }

  return null; // sem caminho
}

/** Line-of-sight entre duas células (Bresenham com checagem de bloqueio). */
function hasLineOfSight(
  grid: WalkableGrid,
  r1: number,
  c1: number,
  r2: number,
  c2: number,
): boolean {
  let r0 = r1, c0 = c1;
  const dr = Math.abs(r2 - r1), dc = Math.abs(c2 - c1);
  const sr = r1 < r2 ? 1 : -1, sc = c1 < c2 ? 1 : -1;
  let err = dr - dc;

  while (true) {
    if (grid.blocked[r0]![c0]) return false;
    if (r0 === r2 && c0 === c2) return true;
    const e2 = 2 * err;
    if (e2 > -dc) { err -= dc; r0 += sr; }
    if (e2 < dr) { err += dr; c0 += sc; }
  }
}

/**
 * Suavização greedy (string-pulling simplificado): mantém apenas vértices
 * onde a linha de visão muda. Reduz o path serrilhado do grid para ~5-15 pontos.
 */
export function smoothPath(
  grid: WalkableGrid,
  path: Array<{ row: number; col: number }>,
): Array<{ row: number; col: number }> {
  if (path.length <= 2) return path;

  const result: Array<{ row: number; col: number }> = [path[0]!];
  let anchor = 0;

  for (let i = 2; i < path.length; i++) {
    if (!hasLineOfSight(grid, path[anchor]!.row, path[anchor]!.col, path[i]!.row, path[i]!.col)) {
      result.push(path[i - 1]!);
      anchor = i - 1;
    }
  }
  result.push(path[path.length - 1]!);
  return result;
}

/** Interface de rota completa: executa snap + A* + smooth e devolve polyline WGS84. */
export function findRoute(
  grid: WalkableGrid,
  originLat: number,
  originLng: number,
  targetLat: number,
  targetLng: number,
): Array<{ latitude: number; longitude: number }> | null {
  const start = snapToWalkable(grid, originLat, originLng);
  const end = snapToWalkable(grid, targetLat, targetLng);

  const raw = aStar(grid, start.row, start.col, end.row, end.col);
  if (!raw) return null;

  const smoothed = smoothPath(grid, raw);
  return smoothed.map((cell) => cellToLatLng(grid, cell.row, cell.col));
}
