import React, { createContext, useContext } from "react";
import { Img, interpolate, staticFile } from "remotion";
import { FONT_DISPLAY } from "../fonts";

export const FPS = 30;
export const clampX = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/* ---------- timeline (cut first, audio 3f later, 2f gap, hold, L-cut reaction) ---------- */
export type TLShot = { id: string; hold?: boolean | number; reactionCut?: boolean };
export type Seg = { cut: number; audioStart: number; A: number; audioEnd: number; end: number; lead: number; dur: number; capSpan: number; reacted: boolean };
export const CUT_LEAD = 3;
export const GAP = 2;
export const REACT_EARLY = 8;

export function buildTimeline(shots: (TLShot & { hold?: number })[], sec: Record<string, number>, hookF: number): Seg[] {
  const segs: Seg[] = [];
  let prevEnd = 0, prevGap = 0, prevReact = false;
  shots.forEach((s, i) => {
    const A = Math.max(1, Math.round(sec[s.id] * FPS));
    const audioStart = i === 0 ? hookF + CUT_LEAD : prevEnd + prevGap + CUT_LEAD;
    const cut = i > 0 && prevReact ? prevEnd - REACT_EARLY : audioStart - CUT_LEAD;
    const audioEnd = audioStart + A;
    const gap = s.hold ?? GAP;
    const end = s.reactionCut ? audioEnd - REACT_EARLY : audioEnd + gap;
    segs.push({ cut, audioStart, A, audioEnd, end, lead: audioStart - cut, dur: end - cut, capSpan: A - (s.reactionCut ? REACT_EARLY : 0), reacted: i > 0 && prevReact });
    prevEnd = audioEnd; prevGap = gap; prevReact = !!s.reactionCut;
  });
  return segs;
}

/* ---------- caption: the only text layer ---------- */
export const CAP_STYLE: React.CSSProperties = {
  fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 72, lineHeight: 1.08, wordSpacing: 10, color: "#fff", textAlign: "center",
  WebkitTextStroke: "16px #16130f", paintOrder: "stroke fill", strokeLinejoin: "round", textShadow: "0 7px 0 rgba(22,19,15,0.35)",
} as React.CSSProperties;
export const CAP_BOX: React.CSSProperties = { position: "absolute", left: 120, width: 840, top: 1190, transform: "translateY(-50%)" };

export function makeChunks(text: string): string[][] {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[][] = [];
  let cur: string[] = [];
  for (const w of words) {
    const would = [...cur, w];
    if (cur.length && (would.length > 4 || would.join(" ").length > 22)) { chunks.push(cur); cur = []; }
    cur.push(w);
    if (cur.length >= 2 && /[.?!—…]$/.test(w)) { chunks.push(cur); cur = []; }
  }
  if (cur.length) {
    if (cur.length === 1 && chunks.length && chunks[chunks.length - 1].length < 4 && (chunks[chunks.length - 1].join(" ") + " " + cur[0]).length <= 24) chunks[chunks.length - 1].push(cur[0]);
    else chunks.push(cur);
  }
  return chunks;
}

/** t = frames since the line's audio began; span = frames the caption has to cover. */
export const Caption: React.FC<{ text: string; t: number; span: number; color: string }> = ({ text, t, span, color }) => {
  if (t < 0) return null;
  const chunks = makeChunks(text);
  const wlen = (w: string) => Math.max(2, w.replace(/[^\p{L}\p{N}]/gu, "").length);
  const total = chunks.reduce((a, c) => a + c.reduce((b, w) => b + wlen(w), 0), 0);
  const prog = Math.min(0.9999, Math.max(0, t / Math.max(1, span))) * total;
  let acc = 0, ci = chunks.length - 1, wi = 0;
  outer: for (let i = 0; i < chunks.length; i++) {
    for (let j = 0; j < chunks[i].length; j++) {
      acc += wlen(chunks[i][j]);
      if (prog < acc) { ci = i; wi = j; break outer; }
    }
  }
  // frame at which this chunk started (for the pop-in)
  let before = 0; for (let i = 0; i < ci; i++) before += chunks[i].reduce((b, w) => b + wlen(w), 0);
  const chunkT = t - (before / total) * span;
  const s = interpolate(chunkT, [0, 3], [0.88, 1], clampX);
  return (
    <div style={{ ...CAP_BOX, ...CAP_STYLE, transform: `translateY(-50%) scale(${s})` }}>
      {chunks[ci].map((w, j) => <span key={`${ci}-${j}`} style={{ color: j === wi ? color : "#fff" }}>{w}{j < chunks[ci].length - 1 ? " " : ""}</span>)}
    </div>
  );
};

/* ---------- mirrored costume text ---------- */
export const MirrorCtx = createContext(false);
export const Txt: React.FC<Omit<React.SVGProps<SVGTextElement>, "x" | "y"> & { x: number | string; y: number | string }> = ({ x, y, children, ...p }) => {
  const m = useContext(MirrorCtx);
  return <text x={x} y={y} {...p} transform={m ? `translate(${2 * Number(x)} 0) scale(-1 1)` : undefined}>{children}</text>;
};

/* ---------- stage: fixed sides, eyes at 38%, mascot ~33% of frame height ---------- */
export const CH = 1129;           // mascot box (px); feet at y=1000, head ~550 tall (~29% of frame)
const S = CH / 1254;
export const FEET_Y = 1000;
export const LEFT_X = 0.33 * 1080;
export const RIGHT_X = 0.67 * 1080;

export const Stage: React.FC<{ side: "L" | "R"; bob: number; tilt: number; pop: number; filter?: string; costume: React.ReactNode }> = ({ side, bob, tilt, pop, filter, costume }) => {
  const mirror = side === "R";
  const left = mirror ? RIGHT_X - 624.5 * S : LEFT_X - 629.5 * S;
  const lean = (mirror ? -7 : 7) + tilt;
  return (
    <>
    {/* looking room: brighter on the side the character faces */}
    <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse 75% 50% at ${mirror ? 22 : 78}% 42%, rgba(255,255,255,0.3), rgba(0,0,0,0.12) 100%)` }} />
    <div style={{ position: "absolute", left, top: FEET_Y - 1156 * S, width: CH, height: CH, transform: `translateY(${bob}px) rotate(${lean}deg) scale(${pop})`, transformOrigin: "50% 92%", filter }}>
      <div style={{ position: "absolute", inset: 0, transform: mirror ? "scaleX(-1)" : undefined }}>
        <Img src={staticFile("notetaker/tucky.png")} style={{ position: "absolute", left: 0, top: 0, width: CH, height: CH }} />
        <MirrorCtx.Provider value={mirror}>
          <svg viewBox="0 0 1254 1254" width={CH} height={CH} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>{costume}</svg>
        </MirrorCtx.Provider>
      </div>
    </div>
    </>
  );
};

export const FloorShadow: React.FC<{ side: "L" | "R" }> = ({ side }) => (
  <div style={{ position: "absolute", left: (side === "L" ? LEFT_X : RIGHT_X) - 310, top: 984, width: 560, height: 50, borderRadius: "50%", background: "rgba(56,45,29,0.14)" }} />
);

/** 2-degree head tilt on the listener during an L-cut reaction beat. */
export const reactTilt = (f: number, lead: number, reacted: boolean) => (reacted ? 2 * Math.sin(Math.PI * Math.min(1, Math.max(0, f / Math.max(1, lead - 1)))) : 0);
