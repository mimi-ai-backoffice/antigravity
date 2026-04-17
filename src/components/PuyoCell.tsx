"use client";

import { PuyoColor, COLOR_STYLES, EMOJI } from "@/lib/puyoLogic";

interface Props {
  color: PuyoColor;
  popping?: boolean;
  active?: boolean;
  isMain?: boolean;
}

export default function PuyoCell({ color, popping, active, isMain }: Props) {
  if (!color) {
    return (
      <div className="w-full h-full rounded-lg bg-white/10 backdrop-blur-sm border border-white/20" />
    );
  }

  return (
    <div
      className={[
        "w-full h-full rounded-full flex items-center justify-center text-lg font-bold",
        "shadow-lg border-2 border-white/40 transition-all duration-100",
        "select-none",
        COLOR_STYLES[color],
        popping ? "animate-pop" : "",
        active ? "animate-float scale-110" : "",
        !popping && !active ? "animate-fall" : "",
      ].join(" ")}
      style={active && isMain ? {
        filter: "drop-shadow(0 0 8px rgba(255,255,255,0.8))",
      } : undefined}
    >
      <span className="text-sm drop-shadow-md">{EMOJI[color]}</span>
    </div>
  );
}
