"use client";

interface Props {
  score: number;
  highScore: number;
  chain: number;
  maxChain: number;
}

export default function ScoreBoard({ score, highScore, chain, maxChain }: Props) {
  return (
    <div className="rounded-2xl border border-white/40 backdrop-blur-sm p-3 flex flex-col gap-2 min-w-[100px]"
      style={{ background: "rgba(255,255,255,0.2)" }}>
      <div>
        <p className="text-pink-600 text-xs font-bold">👑 ハイスコア</p>
        <p className="text-white font-black text-sm drop-shadow">{highScore.toLocaleString()}</p>
      </div>
      <div>
        <p className="text-purple-600 text-xs font-bold">⭐ スコア</p>
        <p className="text-white font-black text-lg drop-shadow">{score.toLocaleString()}</p>
      </div>
      <div>
        <p className="text-blue-600 text-xs font-bold">💫 連鎖</p>
        <p className="text-white font-black text-sm drop-shadow">
          {chain > 0 ? `${chain}連鎖！` : "-"}
        </p>
      </div>
      <div>
        <p className="text-green-600 text-xs font-bold">🔥 最大連鎖</p>
        <p className="text-white font-black text-sm drop-shadow">{maxChain || "-"}</p>
      </div>
    </div>
  );
}
