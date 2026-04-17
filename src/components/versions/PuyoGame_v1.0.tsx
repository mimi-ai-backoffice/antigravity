"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  COLS, ROWS, Grid, PuyoPair,
  createEmptyGrid, randomPair, isValidPosition,
  placePair, applyGravity, findPoppable, popCells,
  calcScore, getSubOffset,
} from "@/lib/puyoLogic";
import PuyoCell from "./PuyoCell";
import ScoreBoard from "./ScoreBoard";
import NextPuyo from "./NextPuyo";

type Phase = "falling" | "popping" | "gravity" | "checking" | "gameover";

interface Sparkle {
  id: number;
  x: number;
  y: number;
}

export default function PuyoGame() {
  const [grid, setGrid] = useState<Grid>(createEmptyGrid());
  const [current, setCurrent] = useState<PuyoPair>(randomPair());
  const [next, setNext] = useState<PuyoPair>(randomPair());
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [chain, setChain] = useState(0);
  const [maxChain, setMaxChain] = useState(0);
  const [phase, setPhase] = useState<Phase>("falling");
  const [poppingCells, setPoppingCells] = useState<Set<string>>(new Set());
  const [sparkles, setSparkles] = useState<Sparkle[]>([]);
  const [chainDisplay, setChainDisplay] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const sparkleId = useRef(0);
  const dropTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const chainRef = useRef(0);

  useEffect(() => {
    const saved = localStorage.getItem("puyo-highscore");
    if (saved) setHighScore(parseInt(saved));
  }, []);

  const addSparkles = useCallback((cells: [number, number][]) => {
    const newSparkles = cells.map(([r, c]) => ({
      id: sparkleId.current++,
      x: c,
      y: r,
    }));
    setSparkles((prev) => [...prev, ...newSparkles]);
    setTimeout(() => {
      setSparkles((prev) =>
        prev.filter((s) => !newSparkles.find((ns) => ns.id === s.id))
      );
    }, 700);
  }, []);

  const showChainMessage = useCallback((n: number) => {
    const messages = ["", "", "✨ダブル！", "💜トリプル！", "⭐4連鎖！！", "🌟5連鎖！！！", "💫6連鎖！！！！"];
    const msg = n < messages.length ? messages[n] : `🔥${n}連鎖！！！！！`;
    if (n >= 2) {
      setChainDisplay(msg);
      setTimeout(() => setChainDisplay(null), 1200);
    }
  }, []);

  const runChainCheck = useCallback((g: Grid, currentChain: number) => {
    const cells = findPoppable(g);
    if (cells.length > 0) {
      const keySet = new Set(cells.map(([r, c]) => `${r},${c}`));
      setPoppingCells(keySet);
      addSparkles(cells);
      const newChain = currentChain + 1;
      showChainMessage(newChain);
      chainRef.current = newChain;
      setChain(newChain);
      setMaxChain((prev) => Math.max(prev, newChain));

      setTimeout(() => {
        const pts = calcScore(cells.length, newChain);
        setScore((prev) => {
          const updated = prev + pts;
          if (updated > highScore) {
            setHighScore(updated);
            localStorage.setItem("puyo-highscore", String(updated));
          }
          return updated;
        });
        const popped = popCells(g, cells);
        const afterGravity = applyGravity(popped);
        setPoppingCells(new Set());
        setGrid(afterGravity);
        setPhase("checking");
        runChainCheck(afterGravity, newChain);
      }, 600);
    } else {
      setPhase("falling");
      setChain(0);
      chainRef.current = 0;
    }
  }, [addSparkles, showChainMessage, highScore]);

  const lockPair = useCallback((g: Grid, pair: PuyoPair) => {
    const placed = placePair(g, pair);
    const afterGravity = applyGravity(placed);
    setGrid(afterGravity);

    // ゲームオーバー判定
    if (afterGravity[1][2] !== null || afterGravity[1][3] !== null) {
      setPhase("gameover");
      return;
    }

    setPhase("checking");
    runChainCheck(afterGravity, 0);
  }, [runChainCheck]);

  const movePair = useCallback((dir: "left" | "right" | "down") => {
    if (phase !== "falling") return;
    setCurrent((prev) => {
      const next = { ...prev };
      if (dir === "left") next.x -= 1;
      if (dir === "right") next.x += 1;
      if (dir === "down") next.y += 1;
      return isValidPosition(grid, next) ? next : prev;
    });
  }, [grid, phase]);

  const rotatePair = useCallback((dir: "cw" | "ccw") => {
    if (phase !== "falling") return;
    setCurrent((prev) => {
      const newRotation = ((prev.rotation + (dir === "cw" ? 1 : 3)) % 4) as 0 | 1 | 2 | 3;
      const candidate = { ...prev, rotation: newRotation };
      if (isValidPosition(grid, candidate)) return candidate;

      // 壁キック
      const kicked1 = { ...candidate, x: candidate.x + 1 };
      if (isValidPosition(grid, kicked1)) return kicked1;
      const kicked2 = { ...candidate, x: candidate.x - 1 };
      if (isValidPosition(grid, kicked2)) return kicked2;

      return prev;
    });
  }, [grid, phase]);

  const hardDrop = useCallback(() => {
    if (phase !== "falling") return;
    setCurrent((prev) => {
      let dropped = { ...prev };
      while (true) {
        const next = { ...dropped, y: dropped.y + 1 };
        if (!isValidPosition(grid, next)) break;
        dropped = next;
      }
      lockPair(grid, dropped);
      return dropped;
    });
  }, [grid, phase, lockPair]);

  // 自動落下
  useEffect(() => {
    if (!started || phase !== "falling") return;
    dropTimer.current = setInterval(() => {
      setCurrent((prev) => {
        const next = { ...prev, y: prev.y + 1 };
        if (!isValidPosition(grid, next)) {
          clearInterval(dropTimer.current!);
          lockPair(grid, prev);
          const newPair = { ...next, y: 0, x: 2, rotation: 0 as const };
          setNext((n) => {
            setCurrent({ ...n });
            return randomPair();
          });
          return prev;
        }
        return next;
      });
    }, 600);
    return () => clearInterval(dropTimer.current!);
  }, [started, phase, grid, lockPair]);

  // キーボード操作
  useEffect(() => {
    if (!started) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") movePair("left");
      if (e.key === "ArrowRight") movePair("right");
      if (e.key === "ArrowDown") movePair("down");
      if (e.key === "ArrowUp" || e.key === "x" || e.key === "X") rotatePair("cw");
      if (e.key === "z" || e.key === "Z") rotatePair("ccw");
      if (e.key === " ") { e.preventDefault(); hardDrop(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [started, movePair, rotatePair, hardDrop]);

  const startGame = () => {
    setGrid(createEmptyGrid());
    setCurrent(randomPair());
    setNext(randomPair());
    setScore(0);
    setChain(0);
    setMaxChain(0);
    setPhase("falling");
    setSparkles([]);
    setPoppingCells(new Set());
    setChainDisplay(null);
    chainRef.current = 0;
    setStarted(true);
  };

  // 描画用グリッド（現在のぷよを重ねる）
  const displayGrid: Grid = grid.map((row) => [...row]);
  if (phase === "falling") {
    const { x, y, main, sub, rotation } = current;
    const [dx, dy] = getSubOffset(rotation);
    if (y >= 0 && y < ROWS) displayGrid[y][x] = main;
    const sy = y + dy;
    const sx = x + dx;
    if (sy >= 0 && sy < ROWS && sx >= 0 && sx < COLS) displayGrid[sy][sx] = sub;
  }

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-md">
      {/* タイトル */}
      <div className="text-center animate-bounce-in">
        <h1 className="text-4xl font-black text-transparent bg-clip-text holographic bg-gradient-to-r from-pink-400 via-purple-400 to-blue-400 drop-shadow-lg">
          ✨ ぷよぷよ ✨
        </h1>
        <p className="text-pink-500 text-sm font-bold mt-1">kawaii puyo game</p>
      </div>

      <div className="flex gap-4 items-start w-full justify-center">
        {/* ゲームボード */}
        <div className="relative">
          <div
            className="rounded-2xl overflow-hidden border-2 border-white/50 backdrop-blur-sm shadow-2xl animate-glow-pulse"
            style={{
              background: "rgba(255,255,255,0.15)",
              padding: "6px",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${COLS}, 36px)`,
                gridTemplateRows: `repeat(${ROWS}, 36px)`,
                gap: "3px",
              }}
            >
              {displayGrid.map((row, r) =>
                row.map((color, c) => {
                  const key = `${r},${c}`;
                  const isPopping = poppingCells.has(key);
                  const isActive =
                    phase === "falling" &&
                    ((r === current.y && c === current.x) ||
                      (() => {
                        const [dx, dy] = getSubOffset(current.rotation);
                        return r === current.y + dy && c === current.x + dx;
                      })());
                  const isMain = phase === "falling" && r === current.y && c === current.x;
                  return (
                    <div key={key} className="w-9 h-9 relative">
                      <PuyoCell
                        color={color}
                        popping={isPopping}
                        active={isActive}
                        isMain={isMain}
                      />
                      {/* スパークル */}
                      {sparkles
                        .filter((s) => s.x === c && s.y === r)
                        .map((s) => (
                          <div
                            key={s.id}
                            className="absolute inset-0 flex items-center justify-center pointer-events-none animate-sparkle text-xl z-10"
                          >
                            ✨
                          </div>
                        ))}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* チェーン表示 */}
          {chainDisplay && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
              <div className="text-2xl font-black text-white animate-bounce-in drop-shadow-[0_2px_8px_rgba(200,0,200,0.8)] bg-purple-500/60 px-4 py-2 rounded-full backdrop-blur-sm">
                {chainDisplay}
              </div>
            </div>
          )}

          {/* ゲームオーバー */}
          {phase === "gameover" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-30 bg-black/50 backdrop-blur-sm rounded-2xl">
              <div className="text-center animate-bounce-in">
                <p className="text-4xl font-black text-white drop-shadow-lg mb-2">💔 ゲームオーバー</p>
                <p className="text-white/80 mb-4">スコア: {score.toLocaleString()}</p>
                <button
                  onClick={startGame}
                  className="px-6 py-3 bg-gradient-to-r from-pink-400 to-purple-500 text-white font-black rounded-full shadow-lg hover:scale-105 active:scale-95 transition-all"
                >
                  もう一度！ 🎮
                </button>
              </div>
            </div>
          )}

          {/* スタート画面 */}
          {!started && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-30 bg-white/30 backdrop-blur-sm rounded-2xl">
              <div className="text-center animate-bounce-in px-4">
                <p className="text-5xl mb-3">🌸</p>
                <p className="text-white font-black text-lg drop-shadow mb-4">
                  かわいいぷよぷよを<br />はじめよう！
                </p>
                <button
                  onClick={startGame}
                  className="px-8 py-3 bg-gradient-to-r from-pink-400 via-purple-400 to-blue-400 text-white font-black rounded-full shadow-xl hover:scale-105 active:scale-95 transition-all text-lg"
                >
                  ✨ スタート ✨
                </button>
              </div>
            </div>
          )}
        </div>

        {/* サイドパネル */}
        <div className="flex flex-col gap-3">
          <ScoreBoard score={score} highScore={highScore} chain={chain} maxChain={maxChain} />
          <NextPuyo pair={next} />

          {started && phase !== "gameover" && (
            <button
              onClick={startGame}
              className="px-3 py-2 bg-white/30 backdrop-blur-sm text-pink-600 font-bold rounded-xl border border-white/50 hover:bg-white/50 transition-all text-xs"
            >
              🔄 リセット
            </button>
          )}
        </div>
      </div>

      {/* モバイル操作ボタン */}
      {started && phase === "falling" && (
        <div className="flex flex-col gap-2 w-full max-w-xs mt-2">
          <div className="flex justify-center gap-3">
            <button
              onPointerDown={() => rotatePair("ccw")}
              className="w-12 h-12 rounded-full bg-purple-400/80 backdrop-blur-sm text-white font-black text-lg shadow-lg active:scale-90 transition-all border border-white/40"
            >
              ↺
            </button>
            <button
              onPointerDown={() => movePair("down")}
              className="w-12 h-12 rounded-full bg-blue-400/80 backdrop-blur-sm text-white font-black text-lg shadow-lg active:scale-90 transition-all border border-white/40"
            >
              ↓
            </button>
            <button
              onPointerDown={() => rotatePair("cw")}
              className="w-12 h-12 rounded-full bg-pink-400/80 backdrop-blur-sm text-white font-black text-lg shadow-lg active:scale-90 transition-all border border-white/40"
            >
              ↻
            </button>
          </div>
          <div className="flex justify-center gap-3">
            <button
              onPointerDown={() => movePair("left")}
              className="w-12 h-12 rounded-full bg-pink-300/80 backdrop-blur-sm text-white font-black text-lg shadow-lg active:scale-90 transition-all border border-white/40"
            >
              ←
            </button>
            <button
              onPointerDown={hardDrop}
              className="w-14 h-12 rounded-full bg-gradient-to-r from-pink-400 to-purple-500 text-white font-black text-xs shadow-lg active:scale-90 transition-all border border-white/40"
            >
              DROP
            </button>
            <button
              onPointerDown={() => movePair("right")}
              className="w-12 h-12 rounded-full bg-pink-300/80 backdrop-blur-sm text-white font-black text-lg shadow-lg active:scale-90 transition-all border border-white/40"
            >
              →
            </button>
          </div>
        </div>
      )}

      {/* キーボード説明 */}
      <div className="text-center text-white/60 text-xs mt-1">
        ← → 移動 ｜ ↑/X 右回転 ｜ Z 左回転 ｜ スペース 落下
      </div>
    </div>
  );
}
