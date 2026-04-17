# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # 開発サーバー起動（http://localhost:3000）
npm run build    # 本番ビルド
npm run lint     # ESLintチェック
```

## Architecture

Next.js 16 App Router + TypeScript + Tailwind CSS v4 の構成。

- `src/app/` — App Router のルート。`layout.tsx` がルートレイアウト、`page.tsx` がトップページ
- Tailwind CSS v4 は `globals.css` に `@import "tailwindcss"` のみで有効化（設定ファイル不要）
- パスエイリアス `@/*` → `src/*`

---

## ぷよぷよゲーム 要件定義

### 概要

10代女性向けのトレンドを取り入れた「おもしろかわいい」ぷよぷよゲーム。
Y2K・ホログラム・パステルグラデーション・グラスモーフィズムをベースにしたUI。

### ファイル構成

| ファイル | 役割 |
|---|---|
| `src/lib/puyoLogic.ts` | ゲームロジック全般（状態を持たない純粋関数） |
| `src/components/PuyoGame.tsx` | メインゲームコンポーネント。状態管理・ループ制御 |
| `src/components/PuyoCell.tsx` | 1つのぷよの描画。アニメーション制御 |
| `src/components/ScoreBoard.tsx` | スコア・連鎖数表示 |
| `src/components/NextPuyo.tsx` | 次のぷよペア表示 |
| `src/app/globals.css` | カスタムアニメーション定義（@keyframes） |

### ゲームルール

- 盤面：6列 × 12行
- ぷよは2個ペアで降ってくる（メインぷよ＋サブぷよ）
- 同じ色が4個以上つながると消える（BFSで連結判定）
- 消えた後、上のぷよが落下（重力）→ 再判定 → 連鎖
- 盤面の2行目（y=1）の3・4列目が埋まったらゲームオーバー

### スコア計算（`calcScore`）

```
得点 = 消えた個数 × 10 × (1 + chainBonus / 10)
```

chainBonus は連鎖数に応じて増加（2連鎖=8, 3連鎖=16, 4連鎖=32 …）。

### ゲームの状態遷移（`phase`）

```
falling → (着地) → checking → (消える) → gravity → checking → ...
                              ↓（消えない）
                            falling（次のペア）
```

- `falling` : プレイヤーがペアを操作中
- `checking` : 連鎖判定中（`findPoppable` を実行）
- `popping` : 消去アニメーション再生中（600ms）
- `gravity` : 重力適用（`applyGravity`）後に再チェック
- `gameover` : 盤面上部が埋まった状態

### 操作

| 操作 | キーボード | タッチボタン |
|---|---|---|
| 左移動 | ← | ← ボタン |
| 右移動 | → | → ボタン |
| 下移動 | ↓ | ↓ ボタン |
| 右回転 | ↑ または X | ↻ ボタン |
| 左回転 | Z | ↺ ボタン |
| ハードドロップ | スペース | DROP ボタン |

### ぷよの色・絵文字

| 色 | 絵文字 | Tailwindクラス |
|---|---|---|
| pink | 🌸 | `from-pink-300 to-pink-500` |
| purple | 💜 | `from-purple-300 to-purple-500` |
| blue | 💙 | `from-blue-300 to-blue-500` |
| yellow | ⭐ | `from-yellow-200 to-yellow-400` |
| green | 🍀 | `from-green-300 to-green-500` |

### アニメーション一覧（globals.css）

| クラス名 | 用途 |
|---|---|
| `animate-float` | 操作中のぷよがふわふわ浮く |
| `animate-pop` | 消去時に拡大→消滅 |
| `animate-fall` | 設置時の落下出現 |
| `animate-sparkle` | 消去時の✨エフェクト |
| `animate-bounce-in` | UI要素の出現 |
| `animate-glow-pulse` | 盤面のグロー点滅 |
| `holographic` | タイトルのホログラム風グラデ |

### データ永続化

- ハイスコアのみ `localStorage`（キー: `puyo-highscore`）に保存
- その他のゲーム状態はリロードでリセット
