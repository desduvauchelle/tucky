import { useEffect, useRef, useState } from "react";
import { RuntimeLoader, useRive, useViewModelInstanceNumber, useViewModelInstanceTrigger } from "@rive-app/react-canvas";
import riveWasmUrl from "@rive-app/canvas/rive.wasm?url";
import riveFallbackWasmUrl from "@rive-app/canvas/rive_fallback.wasm?url";

// Bundle the runtime wasm locally: the pet must work offline (no unpkg/jsdelivr).
// Must run before the first Rive instance is created.
RuntimeLoader.setWasmUrl(riveWasmUrl);
RuntimeLoader.setWasmFallbackUrl(riveFallbackWasmUrl);
RuntimeLoader.setWasmThreadsUrl(null);

export const TUCKY_RIVE_SRC = "/rive/tucky-v2.riv";
const ASPECT = 1230 / 1000; // artboard 1000x1230

interface Props {
  mood: number;
  level: number;
  lookX: number;
  lookY: number;
  onPoke?: () => void;
  /** Width in CSS px; height follows the artboard aspect ratio. Omit to fill the parent (contain fit). */
  size?: number;
  /** Accessible label for the canvas. */
  label?: string;
}

/** Tucky v2 (Rive). Contract: artboard "Tucky", state machine "Main", view model "Pet" {mood, level, lookX, lookY, poke}. */
export function RiveTucky({ mood, level, lookX, lookY, onPoke, size, label = "Tucky" }: Props) {
  const [loadFailed, setLoadFailed] = useState(false);
  const { rive, RiveComponent } = useRive({
    src: TUCKY_RIVE_SRC,
    artboard: "Tucky",
    stateMachine: "Main",
    autoplay: true,
    autoBind: true,
    onLoadError: () => {
      console.error(`[RiveTucky] Rive pet failed to load: could not fetch/parse ${TUCKY_RIVE_SRC}. Run \`bun run build:pet-rive\`.`);
      setLoadFailed(true);
    },
  });
  const vmi = rive?.viewModelInstance ?? null;
  const moodProp = useViewModelInstanceNumber("mood", vmi);
  const levelProp = useViewModelInstanceNumber("level", vmi);
  const lookXProp = useViewModelInstanceNumber("lookX", vmi);
  const lookYProp = useViewModelInstanceNumber("lookY", vmi);
  const poke = useViewModelInstanceTrigger("poke", vmi);
  const failed = useRef(false);

  useEffect(() => { moodProp.setValue?.(mood); }, [mood, moodProp.setValue]);

  // Look + level are eased toward their targets every frame so the rig never jitters.
  const target = useRef({ level, lookX, lookY });
  target.current = { level, lookX, lookY };
  const setters = useRef({ l: levelProp.setValue, x: lookXProp.setValue, y: lookYProp.setValue });
  setters.current = { l: levelProp.setValue, x: lookXProp.setValue, y: lookYProp.setValue };
  useEffect(() => {
    if (!vmi) return;
    const cur = { level: 0, lookX: 0, lookY: 0 };
    let raf = 0;
    const tick = () => {
      const t = target.current;
      cur.level += (t.level - cur.level) * 0.35;
      cur.lookX += (t.lookX - cur.lookX) * 0.18;
      cur.lookY += (t.lookY - cur.lookY) * 0.18;
      setters.current.l?.(Math.max(0, Math.min(1, cur.level)));
      setters.current.x?.(Math.max(-1, Math.min(1, cur.lookX)));
      setters.current.y?.(Math.max(-1, Math.min(1, cur.lookY)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [vmi]);

  useEffect(() => {
    if (rive && !vmi && !failed.current) {
      failed.current = true;
      console.error("[RiveTucky] loaded, but artboard has no bound view model instance (expected view model \"Pet\").");
    }
  }, [rive, vmi]);

  if (loadFailed) {
    return (
      <div role="alert" style={{ width: size ?? "100%", height: size ? size * ASPECT : "100%", display: "grid", placeItems: "center", textAlign: "center",
        border: "2px dashed #b3261e", borderRadius: 12, color: "#b3261e", font: "14px system-ui, sans-serif", padding: 12, boxSizing: "border-box" }}>
        Rive pet failed to load
      </div>
    );
  }
  return (
    <div style={{ width: size ?? "100%", height: size ? size * ASPECT : "100%", position: "relative", minWidth: 0, minHeight: 0, contain: "size" }}
      onPointerDown={() => { poke.trigger?.(); onPoke?.(); }}>
      <RiveComponent style={{ position: "absolute", inset: 0, width: "100%", height: "100%", cursor: "pointer" }} aria-label={label} />
    </div>
  );
}
