import React from "react";
import { AbsoluteFill, Audio, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Caption, FloorShadow, Stage, buildTimeline, reactTilt, Seg } from "../shorts/shared";
import { FONT_BODY, FONT_DISPLAY } from "../fonts";
import script from "./script.json";
import durations from "./durations.json";
import { BotProps, LegalProps, SamProps } from "./costumes";

const FPS = 30;
const PAPER = "#F1EFE8";
const MINT = "#8FE0BA";
const AMBER = "#FEBC2E";
const INK = "#382d1d";
const clampX = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

type Who = "BOT" | "SAM" | "LEGAL" | "TUCKY";
type Shot = { id: string; who: Who; text: string; slam?: boolean; glassesOff?: boolean; hold?: number; reactionCut?: boolean };
const SHOTS = script.shots as Shot[];
const SEC = (durations as { vo: boolean; sec: Record<string, number> }).sec;
export const HAS_VO = (durations as { vo: boolean }).vo;
const HOOK_F = Math.round(1.5 * FPS);
const END_F = 3 * FPS;
const SEGS: Seg[] = buildTimeline(SHOTS, SEC, HOOK_F);
export const TOTAL_FRAMES = SEGS[SEGS.length - 1].end + END_F;
const SIDE: Record<Who, "L" | "R"> = { SAM: "L", LEGAL: "L", TUCKY: "L", BOT: "R" };

const TAG: Record<Who, { label: string; color: string; fg: string }> = {
  BOT: { label: "BOT", color: "#5b8cff", fg: "#fff" },
  SAM: { label: "SAM", color: "#6ec1ff", fg: "#1a1410" },
  LEGAL: { label: "LEGAL", color: AMBER, fg: "#1a1410" },
  TUCKY: { label: "TUCKY", color: MINT, fg: "#1a1410" },
};

/* ---------------- hook ---------------- */
const Tile: React.FC<{ x: number; y: number; w: number; h: number; name: string; color: string; initial: string; show?: number }> = ({ x, y, w, h, name, color, initial, show = 1 }) => (
  <div style={{ position: "absolute", left: x, top: y, width: w, height: h, borderRadius: 36, background: "#242830", overflow: "hidden", opacity: show, transform: `scale(${0.94 + 0.06 * show})` }}>
    <div style={{ position: "absolute", left: "50%", top: "46%", width: 190, height: 190, marginLeft: -95, marginTop: -95, borderRadius: 95, background: color, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 96, color: "#fff" }}>{initial}</div>
    <div style={{ position: "absolute", left: 24, top: 20, padding: "8px 18px", borderRadius: 14, background: "rgba(0,0,0,0.55)", color: "#fff", fontFamily: FONT_BODY, fontWeight: 600, fontSize: 34 }}>{name}</div>
  </div>
);

const Hook: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame: f - 12, fps, config: { damping: 15, stiffness: 170 } });
  const toastY = interpolate(sp, [0, 1], [260, 0]);
  const botShow = interpolate(f, [12, 17], [0, 1], clampX);
  const titleIn = interpolate(f, [0, 5], [0.85, 1], clampX);
  return (
    <AbsoluteFill style={{ background: "#14161b" }}>
      <Tile x={40} y={150} w={490} h={620} name="Sam" color="#7b8794" initial="S" />
      <Tile x={550} y={150} w={490} h={620} name="You" color="#d98a4e" initial="Y" />
      <div style={{ position: "absolute", left: 40, top: 790, width: 1000, height: 560, borderRadius: 36, background: "#1b1e24" }} />
      <Tile x={40} y={790} w={1000} h={560} name="Notetaker.ai (Bot)" color="#2f6bff" initial="AI" show={botShow} />
      <AbsoluteFill style={{ background: "rgba(0,0,0,0.5)" }} />
      <div style={{ position: "absolute", left: 40, right: 40, top: 420, textAlign: "center", fontFamily: FONT_DISPLAY, fontWeight: 900, fontSize: 138, lineHeight: 1.0, color: "#fff", transform: `scale(${titleIn})`, textShadow: "0 6px 0 rgba(0,0,0,0.6), 0 0 40px rgba(0,0,0,0.6)", letterSpacing: -2 }}>
        POV: a bot<br />joins <span style={{ color: AMBER }}>your 1:1</span>
      </div>
      {/* macOS-style toast */}
      <div style={{ position: "absolute", left: 60, right: 60, top: 1110, transform: `translateY(${toastY}px)`, opacity: interpolate(f, [12, 15], [0, 1], clampX), borderRadius: 44, background: "rgba(246,246,248,0.96)", boxShadow: "0 24px 60px rgba(0,0,0,0.5)", padding: "34px 40px", display: "flex", alignItems: "center", gap: 32 }}>
        <div style={{ width: 120, height: 120, borderRadius: 28, background: "linear-gradient(135deg,#4a7bff,#2f6bff)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_DISPLAY, fontWeight: 900, fontSize: 56, color: "#fff", flexShrink: 0 }}>AI</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: FONT_BODY, fontSize: 30, color: "#6b6b72", fontWeight: 600 }}><span>Notetaker.ai</span><span>now</span></div>
          <div style={{ fontFamily: FONT_BODY, fontWeight: 700, fontSize: 46, color: "#111", lineHeight: 1.15, marginTop: 6 }}>{script.hook.toast}</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ---------------- shot ---------------- */
const Costume: React.FC<{ shot: Shot; f: number; dur: number }> = ({ shot, f, dur }) =>
  shot.who === "BOT" ? <BotProps f={f} dur={dur} glassesOff={shot.glassesOff} /> : shot.who === "SAM" ? <SamProps f={f} /> : shot.who === "LEGAL" ? <LegalProps f={f} /> : null;

const ShotView: React.FC<{ shot: Shot; seg: Seg }> = ({ shot, seg }) => {
  const f = useCurrentFrame();
  const tag = TAG[shot.who];
  const speaking = f >= seg.lead && f < seg.lead + seg.capSpan;
  const bob = Math.sin(f / 7) * (shot.who === "TUCKY" ? 8 : 4) * (speaking ? 1 : 0.4);
  const pop = interpolate(f, [0, 4], [1.03, 1], clampX);
  const shake = shot.slam && f >= 6 && f <= 8 ? [[16, -10], [-14, 9], [9, -5]][f - 6] : [0, 0];
  const bg = shot.who === "BOT" ? "#dfe6f2" : PAPER;
  const side = SIDE[shot.who];
  return (
    <AbsoluteFill style={{ background: bg }}>
      <AbsoluteFill style={{ transform: `translate(${shake[0]}px, ${shake[1]}px)` }}>
        {shot.who === "TUCKY" ? <MenuBar /> : <FloorShadow side={side} />}
        <Stage side={side} bob={bob} tilt={reactTilt(f, seg.lead, seg.reacted)} pop={pop} costume={<Costume shot={shot} f={f} dur={seg.dur} />} />
        {shot.who === "BOT" && <AbsoluteFill style={{ background: `rgba(70,120,255,${0.1 + 0.025 * Math.sin(f / 3)})`, mixBlendMode: "multiply", pointerEvents: "none" }} />}
        {shot.who === "BOT" && <AbsoluteFill style={{ backgroundImage: "repeating-linear-gradient(0deg, rgba(40,80,200,0.06) 0 3px, transparent 3px 7px)" }} />}
        <Caption text={shot.text} t={f - seg.lead} span={seg.capSpan} color={tag.color} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const MenuBar: React.FC = () => (
  <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 74, background: "#1c1c1f", display: "flex", alignItems: "center", padding: "0 30px", gap: 34, fontFamily: FONT_BODY, color: "#f2f2f2", fontSize: 32, fontWeight: 500 }}>
    <span style={{ fontWeight: 800 }}>Finder</span><span>File</span><span>Edit</span><span>View</span>
    <span style={{ flex: 1 }} />
    <span style={{ background: MINT, borderRadius: 12, padding: "2px 12px", fontSize: 40 }}>{"\u{1F43F}"}</span>
    <span>{"◔"}</span>
    <span style={{ fontWeight: 600 }}>Mon 9:41 AM</span>
  </div>
);

/* ---------------- end card ---------------- */
const EndCard: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = spring({ frame: f, fps, config: { damping: 14, stiffness: 150 } });
  const a = (s: number) => ({ opacity: interpolate(f, [s, s + 8], [0, 1], clampX), transform: `translateY(${interpolate(f, [s, s + 8], [24, 0], clampX)}px)` });
  return (
    <AbsoluteFill style={{ background: PAPER, alignItems: "center" }}>
      <div style={{ marginTop: 300, fontFamily: FONT_DISPLAY, fontWeight: 900, fontSize: 230, color: "#16130f", letterSpacing: -6, transform: `scale(${0.85 + 0.15 * t})`, position: "relative" }}>
        Tucky.
        <div style={{ position: "absolute", left: 8, right: 70, bottom: 22, height: 36, background: MINT, zIndex: -1, borderRadius: 8 }} />
      </div>
      <div style={{ marginTop: 56, fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 76, color: INK, textAlign: "center", ...a(14) }}>Free, local meeting notes.</div>
      <div style={{ marginTop: 28, fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 56, color: INK, textAlign: "center", lineHeight: 1.2, padding: "0 70px", ...a(26) }}>No bot. No cloud.<br />No {"“"}partners{"”"}.</div>
      <div style={{ marginTop: 56, background: "#16130f", color: MINT, borderRadius: 999, padding: "18px 54px", fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 56, ...a(40) }}>tucky.ai-juicing.com</div>
      <Img src={staticFile("notetaker/tucky.png")} style={{ position: "absolute", bottom: 210, width: 460, height: 460, transform: `translateY(${Math.sin(f / 8) * 5}px)` }} />
    </AbsoluteFill>
  );
};

export const NotetakerShort: React.FC = () => (
  <AbsoluteFill style={{ background: PAPER }}>
    <Sequence from={0} durationInFrames={HOOK_F}>
      <Hook />
      <Audio src={staticFile("notetaker/pop.wav")} startFrom={0} volume={0.5} />
    </Sequence>
    {SHOTS.map((s, i) => (
      <Sequence key={s.id} from={SEGS[i].cut} durationInFrames={SEGS[i].dur}>
        <ShotView shot={s} seg={SEGS[i]} />
        <Audio src={staticFile("notetaker/tick.wav")} volume={0.18} />
        {s.slam && <Sequence from={6}><Audio src={staticFile("notetaker/hit.wav")} volume={0.5} /></Sequence>}
      </Sequence>
    ))}
    {HAS_VO && SHOTS.map((s, i) => (
      <Sequence key={`vo-${s.id}`} from={SEGS[i].audioStart} durationInFrames={SEGS[i].A + 2}>
        <Audio src={staticFile(`notetaker/vo/n-${s.id}.wav`)} />
      </Sequence>
    ))}
    <Sequence from={TOTAL_FRAMES - END_F} durationInFrames={END_F}>
      <EndCard />
    </Sequence>
  </AbsoluteFill>
);
