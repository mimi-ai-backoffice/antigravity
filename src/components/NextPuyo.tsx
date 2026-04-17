"use client";

import { PuyoPair, COLOR_STYLES, EMOJI } from "@/lib/puyoLogic";

interface Props {
  pair: PuyoPair;
}

export default function NextPuyo({ pair }: Props) {
  return (
    <div className="rounded-2xl border border-white/40 backdrop-blur-sm p-3 flex flex-col items-center gap-2"
      style={{ background: "rgba(255,255,255,0.2)" }}>
      <p className="text-pink-600 text-xs font-bold">NEXT</p>
      <div className="flex flex-col items-center gap-1">
        {[pair.sub, pair.main].map((color, i) => (
          <div
            key={i}
            className={[
              "w-8 h-8 rounded-full flex items-center justify-center shadow-md border border-white/40",
              color ? COLOR_STYLES[color] : "bg-white/20",
            ].join(" ")}
          >
            <span className="text-xs">{color ? EMOJI[color] : ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
