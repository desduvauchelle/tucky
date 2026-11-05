import React from "react";
import { interpolate } from "remotion";
import { FONT_DISPLAY } from "../fonts";
import { Txt } from "../shorts/shared";

// All props are drawn in the mascot PNG's own 1254x1254 coordinate space.
// Eye centres: L(470,500) R(765,500). Nose (625,590). Paws ~ (510,790) / (800,880). Neck ~ y 730.
const INK = "#1a1410";

export const BotProps: React.FC<{ f: number; dur: number; glassesOff?: boolean }> = ({ f, dur, glassesOff }) => {
  const t0 = Math.max(12, dur - 44);
  const slide = glassesOff ? interpolate(f, [t0, t0 + 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
  const fall = glassesOff ? interpolate(f, [t0 + 22, t0 + 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
  const gy = slide * 78 + fall * fall * 900;
  const gr = fall * 40;
  const gx = fall * 120;
  return (
    <g>
      {/* shirt collar */}
      <polygon points="515,728 612,772 556,838" fill="#fff" stroke={INK} strokeWidth="7" strokeLinejoin="round" />
      <polygon points="740,728 643,772 699,838" fill="#fff" stroke={INK} strokeWidth="7" strokeLinejoin="round" />
      {/* tie */}
      <polygon points="597,745 657,745 646,796 608,796" fill="#15151a" stroke={INK} strokeWidth="5" strokeLinejoin="round" />
      <polygon points="608,796 646,796 692,990 627,1046 562,990" fill="#15151a" stroke={INK} strokeWidth="5" strokeLinejoin="round" />
      <polygon points="622,800 632,800 640,960 622,960" fill="#2b2b34" />
      {/* lanyard */}
      <path d="M500 722 L585 935" stroke="#2f6bff" strokeWidth="22" strokeLinecap="round" fill="none" />
      <path d="M755 722 L670 935" stroke="#2f6bff" strokeWidth="22" strokeLinecap="round" fill="none" />
      <g transform="rotate(4 627 1000)">
        <rect x="605" y="925" width="44" height="22" rx="8" fill="#9aa0a6" stroke={INK} strokeWidth="5" />
        <rect x="512" y="945" width="230" height="165" rx="16" fill="#fff" stroke={INK} strokeWidth="7" />
        <rect x="512" y="945" width="230" height="46" rx="16" fill="#2f6bff" />
        <rect x="512" y="970" width="230" height="21" fill="#2f6bff" />
        <Txt x="627" y="1040" textAnchor="middle" fontFamily={FONT_DISPLAY} fontWeight={900} fontSize="38" fill={INK}>NOTETAKER</Txt>
        <Txt x="627" y="1090" textAnchor="middle" fontFamily={FONT_DISPLAY} fontWeight={900} fontSize="54" fill="#2f6bff">.AI</Txt>
      </g>
      {/* sunglasses */}
      <g transform={`translate(${gx} ${gy}) rotate(${gr} 627 500)`}>
        <line x1="355" y1="450" x2="296" y2="418" stroke="#0a0a0a" strokeWidth="16" strokeLinecap="round" />
        <line x1="885" y1="450" x2="954" y2="418" stroke="#0a0a0a" strokeWidth="16" strokeLinecap="round" />
        <rect x="582" y="455" width="90" height="26" rx="13" fill="#0a0a0a" />
        <rect x="352" y="420" width="240" height="155" rx="62" fill="#0a0a0a" stroke="#000" strokeWidth="6" />
        <rect x="648" y="420" width="240" height="155" rx="62" fill="#0a0a0a" stroke="#000" strokeWidth="6" />
        <path d="M390 450 L450 450 L410 545 L375 545 Z" fill="#fff" opacity="0.18" />
        <path d="M686 450 L746 450 L706 545 L671 545 Z" fill="#fff" opacity="0.18" />
      </g>
    </g>
  );
};

export const SamProps: React.FC<{ f: number }> = ({ f }) => {
  const steam = (i: number) => {
    const p = ((f + i * 14) % 42) / 42;
    return { y: -p * 70, o: Math.sin(p * Math.PI) * 0.7 };
  };
  return (
    <g>
      {/* hoodie (translucent so the paws/bag read through = outline feel) */}
      <path d="M322 800 Q290 940 335 1112 L925 1112 Q972 940 935 800 Q780 765 627 790 Q474 765 322 800 Z" fill="#9ea4aa" fillOpacity="0.74" stroke="#4a4f55" strokeWidth="7" strokeLinejoin="round" />
      <ellipse cx="372" cy="900" rx="82" ry="150" fill="#9ea4aa" fillOpacity="0.6" stroke="#4a4f55" strokeWidth="6" />
      <ellipse cx="888" cy="905" rx="82" ry="150" fill="#9ea4aa" fillOpacity="0.6" stroke="#4a4f55" strokeWidth="6" />
      <path d="M390 742 Q627 910 868 742" stroke="#8a9097" strokeWidth="52" strokeLinecap="round" fill="none" />
      <path d="M390 742 Q627 910 868 742" stroke="#4a4f55" strokeWidth="6" strokeLinecap="round" fill="none" transform="translate(0 24)" />
      <path d="M590 872 L580 975 M668 872 L678 975" stroke="#e8e8ec" strokeWidth="9" strokeLinecap="round" />
      <circle cx="580" cy="980" r="9" fill="#4a4f55" /><circle cx="678" cy="980" r="9" fill="#4a4f55" />
      <path d="M440 1010 L815 1010 L850 1102 L405 1102 Z" fill="none" stroke="#4a4f55" strokeWidth="6" strokeLinejoin="round" />
      {/* tired eyelids */}
      <path d="M392 512 L392 478 Q470 392 548 478 L548 512 Z" fill="#b9692a" stroke="#3a2410" strokeWidth="8" strokeLinejoin="round" />
      <path d="M688 512 L688 478 Q766 392 844 478 L844 512 Z" fill="#b9692a" stroke="#3a2410" strokeWidth="8" strokeLinejoin="round" />
      {/* mug */}
      <g>
        {[0, 1, 2].map((i) => {
          const s = steam(i);
          return <path key={i} d={`M${498 + i * 38} 700 q -14 -26 0 -50 q 14 -24 0 -48`} transform={`translate(0 ${s.y})`} stroke="#8a8a8a" strokeWidth="9" strokeLinecap="round" fill="none" opacity={s.o} />;
        })}
        <path d="M455 745 q -66 6 -60 56 q 6 50 62 48" stroke="#f4f1ea" strokeWidth="22" fill="none" />
        <path d="M455 745 q -66 6 -60 56 q 6 50 62 48" stroke={INK} strokeWidth="6" fill="none" opacity="0.7" />
        <rect x="452" y="710" width="150" height="160" rx="22" fill="#f4f1ea" stroke="#382d1d" strokeWidth="8" />
        <ellipse cx="527" cy="716" rx="73" ry="14" fill="#4b2e17" stroke="#382d1d" strokeWidth="6" />
        <Txt x="527" y="800" textAnchor="middle" fontFamily={FONT_DISPLAY} fontWeight={900} fontSize="30" fill="#382d1d">MONDAY</Txt>
        <ellipse cx="484" cy="842" rx="24" ry="28" fill="#b9692a" stroke="#3a2410" strokeWidth="7" />
        <ellipse cx="527" cy="850" rx="24" ry="28" fill="#b9692a" stroke="#3a2410" strokeWidth="7" />
        <ellipse cx="570" cy="842" rx="24" ry="28" fill="#b9692a" stroke="#3a2410" strokeWidth="7" />
      </g>
    </g>
  );
};

export const LegalProps: React.FC<{ f: number }> = ({ f }) => {
  const land = 6;
  const fy = f < land ? interpolate(f, [0, land], [-1500, 0]) : -Math.max(0, 40 * Math.exp(-(f - land) / 3) * Math.cos((f - land) * 1.2));
  const curls = [
    [360, 255, 72], [452, 215, 72], [545, 190, 72], [627, 182, 72], [710, 190, 72], [802, 215, 72], [894, 255, 72],
    [395, 335, 66], [490, 320, 66], [585, 312, 62], [670, 312, 62], [765, 320, 66], [860, 335, 66],
    [300, 410, 54], [322, 490, 52], [954, 410, 54], [932, 490, 52],
  ];
  return (
    <g>
      {curls.map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="#e7e7ee" stroke="#8b8b96" strokeWidth="7" />
      ))}
      {curls.slice(0, 7).map(([x, y, r], i) => (
        <path key={i} d={`M${x - r * 0.5} ${y + 4} q ${r * 0.5} ${-r * 0.5} ${r} 0`} stroke="#b8b8c4" strokeWidth="5" fill="none" strokeLinecap="round" />
      ))}
      {/* round reading glasses */}
      <circle cx="470" cy="500" r="104" fill="#cfe8ff" fillOpacity="0.2" stroke="#2b2622" strokeWidth="11" />
      <circle cx="765" cy="500" r="104" fill="#cfe8ff" fillOpacity="0.2" stroke="#2b2622" strokeWidth="11" />
      <path d="M572 488 Q618 452 662 488" stroke="#2b2622" strokeWidth="11" fill="none" strokeLinecap="round" />
      <path d="M392 440 Q430 412 470 410" stroke="#fff" strokeOpacity="0.5" strokeWidth="9" fill="none" strokeLinecap="round" />
      <path d="M367 500 L330 470 M868 500 L915 470" stroke="#2b2622" strokeWidth="10" strokeLinecap="round" />
      {/* manila folder */}
      <g transform={`translate(0 ${fy}) rotate(-5 627 940)`}>
        <path d="M405 800 L520 800 L545 828 L850 828 L850 1090 L405 1090 Z" fill="#d9b56c" stroke="#7a5a22" strokeWidth="8" strokeLinejoin="round" />
        <rect x="405" y="842" width="445" height="248" rx="10" fill="#ecc98a" stroke="#7a5a22" strokeWidth="8" />
        <rect x="470" y="905" width="320" height="76" rx="8" fill="#fffdf4" stroke="#7a5a22" strokeWidth="5" />
        <Txt x="630" y="958" textAnchor="middle" fontFamily={FONT_DISPLAY} fontWeight={900} fontSize="44" fill="#382d1d">TERMS.pdf</Txt>
      </g>
    </g>
  );
};
