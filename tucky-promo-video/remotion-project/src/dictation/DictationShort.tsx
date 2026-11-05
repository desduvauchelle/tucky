import React from "react";
import { AbsoluteFill, Audio, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { FONT_BODY, FONT_DISPLAY } from "../fonts";
import script from "./script.json";
import durations from "./durations.json";
import { CAP_BOX, CAP_STYLE, Caption, FloorShadow, Stage, buildTimeline, reactTilt, Seg } from "../shorts/shared";
import { BuiltinProps, FounderProps, Keycap, SalesProps } from "./costumes";

const FPS = 30;
const PAPER = "#F1EFE8";
const MINT = "#8FE0BA";
const AMBER = "#FEBC2E";
const INK = "#382d1d";
const clampX = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

type Who = "FOUNDER" | "BUILTIN" | "SALES" | "TUCKY";
type Shot = { id: string; who: Who; text: string; beat?: string; hold?: number; reactionCut?: boolean };
const SHOTS = script.shots as Shot[];
const SEC = (durations as { vo: boolean; sec: Record<string, number> }).sec;
export const HAS_VO = (durations as { vo: boolean }).vo;
const HOOK_F = Math.round(1.5 * FPS);
const END_F = 3 * FPS;
const SEGS: Seg[] = buildTimeline(SHOTS, SEC, HOOK_F);
export const TOTAL_FRAMES = SEGS[SEGS.length - 1].end + END_F;
const SIDE: Record<Who, "L" | "R"> = { TUCKY: "L", FOUNDER: "R", BUILTIN: "R", SALES: "R" };

const TAG: Record<Who, { label: string; color: string; fg: string }> = {
  FOUNDER: { label: "FOUNDER", color: "#b79cff", fg: "#fff" },
  BUILTIN: { label: "BUILT-IN", color: "#f0d9a0", fg: "#1a1410" },
  SALES: { label: "SALES", color: "#ff8a1f", fg: "#1a1410" },
  TUCKY: { label: "TUCKY", color: MINT, fg: "#1a1410" },
};

/* ---------------- hook ---------------- */
const Tile: React.FC<{ x: number; y: number; w: number; h: number; name: string; sub?: string; color: string; initial: string; show: number; bottom?: boolean }> = ({ x, y, w, h, name, sub, color, initial, show, bottom }) => (
  <div style={{ position: "absolute", left: x, top: y, width: w, height: h, borderRadius: 36, background: "#242830", overflow: "hidden", opacity: show, transform: `scale(${0.94 + 0.06 * show})` }}>
    <div style={{ position: "absolute", left: "50%", top: "42%", width: 150, height: 150, marginLeft: -75, marginTop: -75, borderRadius: 75, background: color, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 70, color: "#fff" }}>{initial}</div>
    <div style={{ position: "absolute", left: 20, ...(bottom ? { bottom: 18 } : { top: 18 }), right: 20, padding: "8px 16px", borderRadius: 14, background: "rgba(0,0,0,0.55)", color: "#fff", fontFamily: FONT_BODY, fontWeight: 600, fontSize: 32, lineHeight: 1.15 }}>
      {name}{sub && <span style={{ color: AMBER, marginLeft: 10 }}>{sub}</span>}
    </div>
  </div>
);

const Hook: React.FC = () => {
  const f = useCurrentFrame();
  const titleIn = interpolate(f, [0, 5], [0.85, 1], clampX);
  const show = (s: number) => interpolate(f, [s, s + 5], [0, 1], clampX);
  return (
    <AbsoluteFill style={{ background: "#14161b" }}>
      <Tile x={40} y={150} w={490} h={560} name="Whispr Flo" sub="$15/mo" color="#7a5cf0" initial="W" show={show(0)} />
      <Tile x={550} y={150} w={490} h={560} name="SubscribeWhisper" sub="$/mo" color="#e26a4a" initial="S" show={show(4)} />
      <Tile x={40} y={730} w={490} h={560} name="Built-in Dictation" color="#a39a82" initial="B" show={show(8)} bottom />
      <Tile x={550} y={730} w={490} h={560} name="You" color="#d98a4e" initial="Y" show={show(12)} bottom />
      <AbsoluteFill style={{ background: "rgba(0,0,0,0.55)" }} />
      <div style={{ position: "absolute", left: 50, right: 50, top: 615, textAlign: "center", fontFamily: FONT_DISPLAY, fontWeight: 900, fontSize: 104, lineHeight: 1.02, color: "#fff", transform: `scale(${titleIn})`, textShadow: "0 6px 0 rgba(0,0,0,0.6), 0 0 40px rgba(0,0,0,0.6)", letterSpacing: -2 }}>
        Every <span style={{ color: AMBER }}>voice-typing</span> app, in one meeting
      </div>
    </AbsoluteFill>
  );
};

/* ---------------- shot pieces ---------------- */
const SQUIGGLE = `url("data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="10"><path d="M0 7 Q4 0 8 5 T16 5" fill="none" stroke="#ff4d4d" stroke-width="3.5" stroke-linecap="round"/></svg>')}")`;

/** BUILTIN beat: the dictated line types letter by letter (autocorrect squiggle on the first word), then "Sent." lands. Single text layer. */
const TypoCaption: React.FC<{ t: number; span: number; color: string }> = ({ t, span, color }) => {
  if (t < 0) return null;
  const text = "Sheep the fish. Sand up.";
  const total = text.length;
  const typed = Math.max(0, Math.min(total, Math.floor((t / (span * 0.72)) * total)));
  const sent = t >= span * 0.8;
  const words = text.split(" ");
  let c = 0;
  const cursorOn = Math.floor(t / 8) % 2 === 0 || typed < total;
  return (
    <div style={{ ...CAP_BOX, ...CAP_STYLE }}>
      <div>
        {words.map((w, wi) => {
          const chars = (wi < words.length - 1 ? w + " " : w).split("");
          const out = (
            <span key={wi} style={wi === 0 ? { backgroundImage: SQUIGGLE, backgroundRepeat: "repeat-x", backgroundPosition: "0 100%", backgroundSize: "16px 10px", paddingBottom: 6 } : undefined}>
              {chars.map((ch, ci) => {
                const gi = c + ci;
                return (
                  <React.Fragment key={ci}>
                    <span style={{ opacity: gi < typed ? 1 : 0 }}>{ch}</span>
                    {gi === typed - 1 && cursorOn && !sent && <span style={{ display: "inline-block", width: 0, position: "relative" }}><span style={{ position: "absolute", left: 3, top: -46, width: 6, height: 58, background: color }} /></span>}
                  </React.Fragment>
                );
              })}
            </span>
          );
          c += chars.length;
          return out;
        })}
      </div>
      {sent && <div style={{ color, marginTop: 4 }}>Sent.</div>}
    </div>
  );
};

const RAW = "so um hold a key and talk talk the uh ums vanish nothing leaves the the Mac free";
const CLEAN = "Hold a key. Talk. The ums vanish. Nothing leaves the Mac. Free.";

/** TUCKY dictation beat: the field is the single text layer. Raw messy transcript dissolves into the clean line, word highlight follows the audio. */
const DictationField: React.FC<{ t: number; span: number; color: string }> = ({ t, span, color }) => {
  if (t < 0) return null;
  const raw = RAW.split(" ");
  const t2 = span * 0.42;
  const nWords = Math.max(0, Math.min(raw.length, Math.floor((t / (t2 * 0.8)) * raw.length)));
  const dis = interpolate(t, [t2, t2 + 12], [0, 1], clampX);
  const words = CLEAN.split(" ");
  const wl = (w: string) => Math.max(2, w.replace(/[^\p{L}\p{N}]/gu, "").length);
  const tot = words.reduce((a, w) => a + wl(w), 0);
  const prog = Math.min(0.9999, t / span) * tot;
  let acc = 0, hi = words.length - 1;
  for (let i = 0; i < words.length; i++) { acc += wl(words[i]); if (prog < acc) { hi = i; break; } }
  const check = interpolate(t, [t2 + 12, t2 + 20], [0, 1], clampX);
  return (
    <div style={{ position: "absolute", left: 120, width: 840, top: 1190, transform: "translateY(-50%)", minHeight: 220, background: "#fff", border: "4px solid #d9d4c6", borderRadius: 30, boxShadow: "0 14px 34px rgba(0,0,0,0.2)", padding: "22px 40px" }}>
      <div style={{ position: "absolute", left: 40, right: 40, top: 22, fontFamily: FONT_BODY, fontSize: 48, lineHeight: 1.2, color: "#a7a7ad", fontStyle: "italic", opacity: 1 - dis, filter: `blur(${dis * 8}px)` }}>
        {raw.slice(0, nWords).join(" ")}
      </div>
      <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 56, lineHeight: 1.12, color: "#16130f", opacity: dis, filter: `blur(${(1 - dis) * 8}px)` }}>
        {words.map((w, i) => <span key={i} style={{ background: i === hi ? color : "transparent", borderRadius: 10, padding: "0 6px", margin: "0 -6px" }}>{w}{i < words.length - 1 ? " " : ""}</span>)}
      </div>
      <div style={{ position: "absolute", right: 22, bottom: 20, width: 50, height: 50, borderRadius: 25, background: color, display: "flex", alignItems: "center", justifyContent: "center", opacity: check, transform: `scale(${0.6 + 0.4 * check})` }}>
        <svg width="30" height="30" viewBox="0 0 32 32"><path d="M6 17 L13 24 L26 8" stroke="#16130f" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>
    </div>
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

const Costume: React.FC<{ shot: Shot; f: number }> = ({ shot, f }) =>
  shot.who === "FOUNDER" ? <FounderProps f={f} /> : shot.who === "BUILTIN" ? <BuiltinProps f={f} /> : shot.who === "SALES" ? <SalesProps f={f} /> : shot.beat === "dictate" ? <Keycap f={f} /> : null;

const ShotView: React.FC<{ shot: Shot; seg: Seg }> = ({ shot, seg }) => {
  const f = useCurrentFrame();
  const tag = TAG[shot.who];
  const speaking = f >= seg.lead && f < seg.lead + seg.capSpan;
  const bob = Math.sin(f / 7) * (shot.who === "TUCKY" ? 8 : shot.who === "BUILTIN" ? 2 : shot.who === "SALES" ? 7 : 4) * (speaking ? 1 : 0.4);
  const pop = interpolate(f, [0, 4], [1.03, 1], clampX);
  const bg = shot.who === "BUILTIN" ? "#e6dcc4" : PAPER;
  const vhs = shot.who === "BUILTIN";
  const band = (f * 14) % 1900;
  const side = SIDE[shot.who];
  const t = f - seg.lead;
  return (
    <AbsoluteFill style={{ background: bg }}>
      {shot.who === "TUCKY" ? <MenuBar /> : <FloorShadow side={side} />}
      <Stage side={side} bob={bob} tilt={reactTilt(f, seg.lead, seg.reacted)} pop={pop} filter={vhs ? "saturate(0.55) sepia(0.28) contrast(0.95)" : undefined} costume={<Costume shot={shot} f={f} />} />
      {vhs && <AbsoluteFill style={{ background: "rgba(150,120,70,0.14)", mixBlendMode: "multiply" }} />}
      {vhs && <AbsoluteFill style={{ backgroundImage: "repeating-linear-gradient(0deg, rgba(0,0,0,0.09) 0 2px, transparent 2px 5px)" }} />}
      {vhs && <div style={{ position: "absolute", left: 0, right: 0, top: band - 200, height: 70, background: "rgba(255,255,255,0.16)", filter: "blur(6px)" }} />}
      {vhs && <AbsoluteFill style={{ backgroundImage: `radial-gradient(rgba(0,0,0,0.22) 1px, transparent 1.4px)`, backgroundSize: "7px 7px", backgroundPosition: `${(f * 37) % 7}px ${(f * 53) % 7}px`, opacity: 0.35 }} />}
      {vhs && <div style={{ position: "absolute", right: 56, top: 190, fontFamily: "monospace", fontWeight: 700, fontSize: 40, color: "#d44", opacity: Math.floor(f / 10) % 2 ? 0.2 : 0.9 }}>{"● PLAY"}</div>}
      {shot.beat === "typo" ? <TypoCaption t={t} span={seg.capSpan} color={tag.color} />
        : shot.beat === "dictate" ? <DictationField t={t} span={seg.capSpan} color={MINT} />
        : <Caption text={shot.text} t={t} span={seg.capSpan} color={tag.color} />}
    </AbsoluteFill>
  );
};

/* ---------------- end card ---------------- */
const EndCard: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = spring({ frame: f, fps, config: { damping: 14, stiffness: 150 } });
  const a = (s: number) => ({ opacity: interpolate(f, [s, s + 8], [0, 1], clampX), transform: `translateY(${interpolate(f, [s, s + 8], [24, 0], clampX)}px)` });
  return (
    <AbsoluteFill style={{ background: PAPER, alignItems: "center" }}>
      <div style={{ marginTop: 260, fontFamily: FONT_DISPLAY, fontWeight: 900, fontSize: 230, color: "#16130f", letterSpacing: -6, transform: `scale(${0.85 + 0.15 * t})`, position: "relative" }}>
        Tucky.
        <div style={{ position: "absolute", left: 8, right: 70, bottom: 22, height: 36, background: MINT, zIndex: -1, borderRadius: 8 }} />
      </div>
      <div style={{ marginTop: 44, fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 68, color: INK, textAlign: "center", lineHeight: 1.12, padding: "0 70px", ...a(14) }}>Free voice-to-text for your whole Mac.</div>
      <div style={{ marginTop: 26, fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 52, color: INK, textAlign: "center", lineHeight: 1.2, padding: "0 60px", ...a(26) }}>On-device. No subscription.<br />No waitlist.</div>
      <div style={{ marginTop: 48, background: "#16130f", color: MINT, borderRadius: 999, padding: "18px 54px", fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 56, ...a(40) }}>tucky.ai-juicing.com</div>
      <Img src={staticFile("notetaker/tucky.png")} style={{ position: "absolute", bottom: 150, width: 440, height: 440, transform: `translateY(${Math.sin(f / 8) * 5}px)` }} />
    </AbsoluteFill>
  );
};

export const DictationShort: React.FC = () => (
  <AbsoluteFill style={{ background: PAPER }}>
    <Sequence from={0} durationInFrames={HOOK_F}>
      <Hook />
      <Audio src={staticFile("dictation/pop.wav")} startFrom={0} volume={0.5} />
    </Sequence>
    {SHOTS.map((s, i) => (
      <Sequence key={s.id} from={SEGS[i].cut} durationInFrames={SEGS[i].dur}>
        <ShotView shot={s} seg={SEGS[i]} />
        <Audio src={staticFile("dictation/tick.wav")} volume={0.18} />
      </Sequence>
    ))}
    {HAS_VO && SHOTS.map((s, i) => (
      <Sequence key={`vo-${s.id}`} from={SEGS[i].audioStart} durationInFrames={SEGS[i].A + 2}>
        <Audio src={staticFile(`dictation/vo/d-${s.id}.wav`)} />
      </Sequence>
    ))}
    <Sequence from={TOTAL_FRAMES - END_F} durationInFrames={END_F}>
      <EndCard />
    </Sequence>
  </AbsoluteFill>
);
