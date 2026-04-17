// v2.0 (2026-04-17) gridRef/nextRef/highScoreRef 導入でクロージャバグを修正
// v1.0 (2026-04-17) 初版作成
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
  const [next, setNext] = useState<PuyoPair>(() => randomPair());
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [chain, setChain] = useState(0);
  const [maxChain, setMaxChain] = useState(0);
  const [phase, setPhase] = useState<Phase>("falling");
  const [poppingCells, setPoppingCells] = useState<Set<string>>(new Set());
  const [sparkles, setSparkles] = useState<Sparkle[]>([]);
  const [chainDisplay, setChainDisplay] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  // ---- Refs（常に最新値を保持、クロージャキャプチャ問題を回避） ----
  const sparkleId = useRef(0);
  const dropTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const chainRef = useRef(0);
  const gridRef = useRef<Grid>(createEmptyGrid());   // interval/callback から最新 grid を読む
  const nextRef = useRef<PuyoPair>(randomPair());    // callback から最新 next を読む
  const highScoreRef = useRef(0);                    // 非同期コールバックから最新 highScore を読む

  // state と ref を同時に更新するラッパー
  const updateGrid = useCallback((g: Grid) => {
    gridRef.current = g;
    setGrid(g);
  }, []);

  const updateNext = useCallback((p: PuyoPair) => {
    nextRef.current = p;
    setNext(p);
  }, []);

  const updateHighScore = useCallback((v: number) => {
    highScoreRef.current = v;
    setHighScore(v);
    localStorage.setItem("puyo-highscore", String(v));
  }, []);

  // ハイスコアの初期読み込み
  useEffect(() => {
    const saved = localStorage.getItem("puyo-highscore");
    if (saved) {
      const v = parseInt(saved);
      highScoreRef.current = v;
      setHighScore(v);
    }
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

  // runChainCheck: highScore を依存配列に持たず highScoreRef.current で参照（バグ2修正）
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
          // highScoreRef で最新値を参照（クロージャキャプチャを回避）
          if (updated > highScoreRef.current) {
            updateHighScore(updated);
          }
          return updated;
        });
        const popped = popCells(g, cells);
        const afterGravity = applyGravity(popped);
        setPoppingCells(new Set());
        updateGrid(afterGravity);
        setPhase("checking");
        runChainCheck(afterGravity, newChain);
      }, 600);
    } else {
      // 消えるものがない → 連鎖終了。次ペアを current にセットしてから falling へ（バグ3修正）
      setChain(0);
      chainRef.current = 0;
      const freshPair = randomPair();
      setCurrent({ ...nextRef.current }); // nextRef で最新の next を読む
      updateNext(freshPair);
      setPhase("falling");
    }
  }, [addSparkles, showChainMessage, updateGrid, updateNext, updateHighScore]);

  // lockPair: grid 更新と phase 変更のみ。setCurrent/setNext は触らない（バグ3修正）
  const lockPair = useCallback((g: Grid, pair: PuyoPair) => {
    const placed = placePair(g, pair);
    const afterGravity = applyGravity(placed);
    updateGrid(afterGravity);

    // ゲームオーバー判定
    if (afterGravity[1][2] !== null || afterGravity[1][3] !== null) {
      setPhase("gameover");
      return;
    }

    setPhase("checking");
    runChainCheck(afterGravity, 0);
  }, [runChainCheck, updateGrid]);

  // movePair: gridRef で最新 grid を参照（バグ1修正）
  const movePair = useCallback((dir: "left" | "right" | "down") => {
    if (phase !== "falling") return;
    setCurrent((prev) => {
      const next = { ...prev };
      if (dir === "left") next.x -= 1;
      if (dir === "right") next.x += 1;
      if (dir === "down") next.y += 1;
      return isValidPosition(gridRef.current, next) ? next : prev;
    });
  }, [phase]);

  // rotatePair: gridRef で最新 grid を参照（バグ1修正）
  const rotatePair = useCallback((dir: "cw" | "ccw") => {
    if (phase !== "falling") return;
    setCurrent((prev) => {
      const newRotation = ((prev.rotation + (dir === "cw" ? 1 : 3)) % 4) as 0 | 1 | 2 | 3;
      const candidate = { ...prev, rotation: newRotation };
      if (isValidPosition(gridRef.current, candidate)) return candidate;
      const kicked1 = { ...candidate, x: candidate.x + 1 };
      if (isValidPosition(gridRef.current, kicked1)) return kicked1;
      const kicked2 = { ...candidate, x: candidate.x - 1 };
      if (isValidPosition(gridRef.current, kicked2)) return kicked2;
      return prev;
    });
  }, [phase]);

  // hardDrop: gridRef で最新 grid を参照（バグ1修正）
  const hardDrop = useCallback(() => {
    if (phase !== "falling") return;
    setCurrent((prev) => {
      let dropped = { ...prev };
      while (true) {
        const candidate = { ...dropped, y: dropped.y + 1 };
        if (!isValidPosition(gridRef.current, candidate)) break;
        dropped = candidate;
      }
      lockPair(gridRef.current, dropped);
      return dropped;
    });
  }, [phase, lockPair]);

  // 自動落下: grid を依存配列から除外し gridRef.current で最新値を読む（バグ1修正）
  useEffect(() => {
    if (!started || phase !== "falling") return;
    dropTimer.current = setInterval(() => {
      setCurrent((prev) => {
        const next = { ...prev, y: prev.y + 1 };
        if (!isValidPosition(gridRef.current, next)) {
          clearInterval(dropTimer.current!);
          lockPair(gridRef.current, prev);
          return prev;
        }
        return next;
      });
    }, 600);
    return () => clearInterval(dropTimer.current!);
  }, [started, phase, lockPair]); // grid を依存配列から除外

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
    const initialGrid = createEmptyGrid();
    const initialCurrent = randomPair();
    const initialNext = randomPair();
    // ref を先に初期化してから state を更新
    gridRef.current = initialGrid;
    nextRef.current = initialNext;
    chainRef.current = 0;
    setGrid(initialGrid);
    setCurrent(initialCurrent);
    updateNext(initialNext);
    setScore(0);
    setChain(0);
    setMaxChain(0);
    setPhase("falling");
    setSparkles([]);
    setPoppingCells(new Set());
    setChainDisplay(null);
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
