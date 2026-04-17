export const COLS = 6;
export const ROWS = 12;

export type PuyoColor = "pink" | "purple" | "blue" | "yellow" | "green" | null;

export type Grid = PuyoColor[][];

export interface Puyo {
  color: PuyoColor;
  popping?: boolean;
}

export type PuyoPair = {
  main: PuyoColor;
  sub: PuyoColor;
  x: number;
  y: number;
  rotation: 0 | 1 | 2 | 3; // 0=上, 1=右, 2=下, 3=左
};

export const PUYO_COLORS: PuyoColor[] = ["pink", "purple", "blue", "yellow", "green"];

export const COLOR_STYLES: Record<NonNullable<PuyoColor>, string> = {
  pink: "bg-gradient-to-br from-pink-300 to-pink-500 shadow-pink-300",
  purple: "bg-gradient-to-br from-purple-300 to-purple-500 shadow-purple-300",
  blue: "bg-gradient-to-br from-blue-300 to-blue-500 shadow-blue-300",
  yellow: "bg-gradient-to-br from-yellow-200 to-yellow-400 shadow-yellow-300",
  green: "bg-gradient-to-br from-green-300 to-green-500 shadow-green-300",
};

export const EMOJI: Record<NonNullable<PuyoColor>, string> = {
  pink: "🌸",
  purple: "💜",
  blue: "💙",
  yellow: "⭐",
  green: "🍀",
};

export function createEmptyGrid(): Grid {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

export function randomColor(): PuyoColor {
  return PUYO_COLORS[Math.floor(Math.random() * PUYO_COLORS.length)];
}

export function randomPair(): PuyoPair {
  return {
    main: randomColor(),
    sub: randomColor(),
    x: 2,
    y: 0,
    rotation: 0,
  };
}

// サブぷよの相対位置を返す
export function getSubOffset(rotation: 0 | 1 | 2 | 3): [number, number] {
  switch (rotation) {
    case 0: return [0, -1]; // 上
    case 1: return [1, 0];  // 右
    case 2: return [0, 1];  // 下
    case 3: return [-1, 0]; // 左
  }
}

export function isValidPosition(grid: Grid, pair: PuyoPair): boolean {
  const { x, y, rotation } = pair;
  const [dx, dy] = getSubOffset(rotation);
  const sx = x + dx;
  const sy = y + dy;

  const inBounds = (px: number, py: number) =>
    px >= 0 && px < COLS && py >= 0 && py < ROWS;

  if (!inBounds(x, y) || !inBounds(sx, sy)) return false;
  if (y >= 0 && grid[y][x] !== null) return false;
  if (sy >= 0 && grid[sy][sx] !== null) return false;
  return true;
}

export function placePair(grid: Grid, pair: PuyoPair): Grid {
  const newGrid = grid.map((row) => [...row]);
  const { x, y, main, sub, rotation } = pair;
  const [dx, dy] = getSubOffset(rotation);

  if (y >= 0 && y < ROWS) newGrid[y][x] = main;
  const sy = y + dy;
  const sx = x + dx;
  if (sy >= 0 && sy < ROWS) newGrid[sy][sx] = sub;

  return newGrid;
}

// 重力：ぷよを下に落とす
export function applyGravity(grid: Grid): Grid {
  const newGrid = createEmptyGrid();
  for (let col = 0; col < COLS; col++) {
    const column = grid.map((row) => row[col]).filter((c) => c !== null);
    const empty = ROWS - column.length;
    for (let row = 0; row < ROWS; row++) {
      newGrid[row][col] = row < empty ? null : column[row - empty];
    }
  }
  return newGrid;
}

// 連結グループを探す（BFS）
function findConnected(grid: Grid, row: number, col: number, color: PuyoColor): [number, number][] {
  const visited = new Set<string>();
  const queue: [number, number][] = [[row, col]];
  const result: [number, number][] = [];

  while (queue.length > 0) {
    const [r, c] = queue.shift()!;
    const key = `${r},${c}`;
    if (visited.has(key)) continue;
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue;
    if (grid[r][c] !== color) continue;

    visited.add(key);
    result.push([r, c]);
    queue.push([r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]);
  }
  return result;
}

// 消せるグループを探す（4個以上）
export function findPoppable(grid: Grid): [number, number][] {
  const visited = new Set<string>();
  const toPop: [number, number][] = [];

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const key = `${r},${c}`;
      if (visited.has(key) || grid[r][c] === null) continue;

      const group = findConnected(grid, r, c, grid[r][c]);
      group.forEach(([gr, gc]) => visited.add(`${gr},${gc}`));

      if (group.length >= 4) {
        toPop.push(...group);
      }
    }
  }
  return toPop;
}

export function popCells(grid: Grid, cells: [number, number][]): Grid {
  const newGrid = grid.map((row) => [...row]);
  cells.forEach(([r, c]) => {
    newGrid[r][c] = null;
  });
  return newGrid;
}

export function calcScore(poppedCount: number, chain: number): number {
  const chainBonus = [0, 0, 8, 16, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 480, 512];
  const bonus = chainBonus[Math.min(chain, chainBonus.length - 1)];
  return poppedCount * 10 * (1 + bonus / 10);
}
