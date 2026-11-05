import React from "react";
import { FONT_DISPLAY } from "../fonts";
import { Txt } from "../shorts/shared";

// Drawn in the mascot PNG's 1254x1254 space. Eyes L(470,500) R(765,500). Neck ~ y 730.
const INK = "#1a1410";

export const FounderProps: React.FC<{ f: number }> = ({ f }) => (
  <g>
    {/* black turtleneck body + sleeves */}
    <path d="M322 800 Q290 940 335 1112 L925 1112 Q972 940 935 800 Q780 765 627 790 Q474 765 322 800 Z" fill="#141416" stroke="#000" strokeWidth="7" strokeLinejoin="round" />
    <ellipse cx="372" cy="900" rx="82" ry="150" fill="#1b1b1f" stroke="#000" strokeWidth="6" />
    <ellipse cx="888" cy="905" rx="82" ry="150" fill="#1b1b1f" stroke="#000" strokeWidth="6" />
    {/* turtleneck roll */}
    <path d="M470 735 Q627 800 785 735" stroke="#141416" strokeWidth="78" strokeLinecap="round" fill="none" />
    <path d="M470 735 Q627 800 785 735" stroke="#2a2a30" strokeWidth="10" strokeLinecap="round" fill="none" transform="translate(0 -22)" />
    <path d="M470 752 Q627 818 785 752" stroke="#000" strokeWidth="6" strokeLinecap="round" fill="none" opacity="0.7" />
    {/* lanyard + SERIES B tag */}
    <path d="M520 748 L585 935" stroke="#8b5cf6" strokeWidth="20" strokeLinecap="round" fill="none" />
    <path d="M735 748 L670 935" stroke="#8b5cf6" strokeWidth="20" strokeLinecap="round" fill="none" />
    <g transform={`rotate(${Math.sin(f / 9) * 2} 627 1000)`}>
      <rect x="605" y="925" width="44" height="22" rx="8" fill="#9aa0a6" stroke={INK} strokeWidth="5" />
      <rect x="512" y="945" width="230" height="172" rx="16" fill="#fff" stroke={INK} strokeWidth="7" />
      <rect x="512" y="945" width="230" height="52" rx="16" fill="#8b5cf6" />
      <rect x="512" y="975" width="230" height="22" fill="#8b5cf6" />
      <Txt x="627" y="983" textAnchor="middle" fontFamily={FONT_DISPLAY} fontWeight={900} fontSize="34" fill="#fff" letterSpacing="2">VC</Txt>
      <Txt x="627" y="1050" textAnchor="middle" fontFamily={FONT_DISPLAY} fontWeight={900} fontSize="44" fill={INK}>SERIES</Txt>
      <Txt x="627" y="1088" textAnchor="middle" fontFamily={FONT_DISPLAY} fontWeight={900} fontSize="44" fill="#8b5cf6">B</Txt>
    </g>
    {/* tiny round glasses */}
    <circle cx="470" cy="500" r="74" fill="#fff" fillOpacity="0.12" stroke="#222" strokeWidth="9" />
    <circle cx="765" cy="500" r="74" fill="#fff" fillOpacity="0.12" stroke="#222" strokeWidth="9" />
    <path d="M543 492 Q618 462 692 492" stroke="#222" strokeWidth="9" fill="none" strokeLinecap="round" />
    <path d="M397 495 L350 470 M838 495 L890 470" stroke="#222" strokeWidth="9" strokeLinecap="round" />
    <path d="M425 470 Q445 452 470 450" stroke="#fff" strokeOpacity="0.6" strokeWidth="7" fill="none" strokeLinecap="round" />
  </g>
);

export const BuiltinProps: React.FC<{ f: number }> = ({ f }) => (
  <g>
    {/* beige cardigan */}
    <path d="M322 800 Q290 940 335 1112 L925 1112 Q972 940 935 800 Q780 765 627 790 Q474 765 322 800 Z" fill="#cdb98f" stroke="#7a6844" strokeWidth="7" strokeLinejoin="round" />
    <ellipse cx="372" cy="900" rx="82" ry="150" fill="#c4af83" stroke="#7a6844" strokeWidth="6" />
    <ellipse cx="888" cy="905" rx="82" ry="150" fill="#c4af83" stroke="#7a6844" strokeWidth="6" />
    {/* shirt under cardigan */}
    <path d="M540 780 L627 1112 L714 780 Q627 830 540 780 Z" fill="#efe6cf" stroke="#7a6844" strokeWidth="6" strokeLinejoin="round" />
    {/* shawl collar */}
    <path d="M430 760 Q480 880 590 1112 M824 760 Q774 880 664 1112" stroke="#7a6844" strokeWidth="9" fill="none" strokeLinecap="round" />
    <path d="M395 748 Q627 900 862 748" stroke="#b9a373" strokeWidth="44" strokeLinecap="round" fill="none" />
    {/* buttons */}
    {[900, 960, 1020, 1080].map((y) => <circle key={y} cx={y < 940 ? 618 : 624} cy={y} r="13" fill="#6b4f2a" stroke="#3a2a12" strokeWidth="4" />)}
    {/* elbow patch + pocket */}
    <rect x="690" y="1000" width="170" height="90" rx="10" fill="none" stroke="#7a6844" strokeWidth="6" />
    {/* thick 1990s glasses */}
    <rect x="352" y="410" width="236" height="188" rx="30" fill="#e9dcb0" fillOpacity="0.28" stroke="#4a2d14" strokeWidth="22" />
    <rect x="648" y="410" width="236" height="188" rx="30" fill="#e9dcb0" fillOpacity="0.28" stroke="#4a2d14" strokeWidth="22" />
    <rect x="585" y="458" width="66" height="26" rx="8" fill="#4a2d14" />
    <path d="M352 460 L300 440 M884 460 L940 440" stroke="#4a2d14" strokeWidth="18" strokeLinecap="round" />
    <path d="M392 440 L450 440 L420 580 L380 580 Z" fill="#fff" opacity={0.18 + 0.05 * Math.sin(f / 4)} />
  </g>
);

export const SalesProps: React.FC<{ f: number }> = ({ f }) => {
  const sh = ((f * 9) % 600) - 100;
  return (
    <g>
      <defs>
        <clipPath id="suit"><path d="M322 800 Q290 940 335 1112 L925 1112 Q972 940 935 800 Q780 765 627 790 Q474 765 322 800 Z" /></clipPath>
        <linearGradient id="suitg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#e4e6ec" /><stop offset="0.5" stopColor="#bfc3cd" /><stop offset="1" stopColor="#dfe2e9" /></linearGradient>
      </defs>
      {/* hair: slicked back */}
      <path d="M318 430 Q300 250 460 205 Q627 160 800 205 Q955 255 938 430 Q900 330 800 300 Q627 250 460 300 Q350 335 318 430 Z" fill="#1d1612" stroke="#000" strokeWidth="7" strokeLinejoin="round" />
      <path d="M390 300 Q470 240 560 232 M520 280 Q640 215 760 235 M660 290 Q770 250 860 290" stroke="#6b5a4c" strokeWidth="8" fill="none" strokeLinecap="round" opacity="0.8" />
      <path d="M430 262 Q520 215 600 212" stroke="#fff" strokeOpacity="0.5" strokeWidth="9" fill="none" strokeLinecap="round" />
      {/* shiny grey suit */}
      <path d="M322 800 Q290 940 335 1112 L925 1112 Q972 940 935 800 Q780 765 627 790 Q474 765 322 800 Z" fill="url(#suitg)" stroke="#6c7280" strokeWidth="7" strokeLinejoin="round" />
      <g clipPath="url(#suit)">
        <rect x={sh} y="780" width="60" height="360" fill="#fff" opacity="0.5" transform={`skewX(-20) translate(${-sh * 0.4} 0)`} />
      </g>
      <ellipse cx="372" cy="900" rx="82" ry="150" fill="url(#suitg)" stroke="#6c7280" strokeWidth="6" />
      <ellipse cx="888" cy="905" rx="82" ry="150" fill="url(#suitg)" stroke="#6c7280" strokeWidth="6" />
      {/* shirt + lapels */}
      <path d="M540 770 L627 1112 L714 770 Q627 820 540 770 Z" fill="#fff" stroke="#6c7280" strokeWidth="6" strokeLinejoin="round" />
      <path d="M440 752 L575 960 L520 1000 L395 800 Z M815 752 L680 960 L735 1000 L860 800 Z" fill="#c9ccd6" stroke="#6c7280" strokeWidth="7" strokeLinejoin="round" />
      {/* loud tie */}
      <polygon points="603,775 651,775 662,812 592,812" fill="#ff5a1f" stroke={INK} strokeWidth="5" strokeLinejoin="round" />
      <polygon points="592,812 662,812 700,1010 627,1085 554,1010" fill="#ff5a1f" stroke={INK} strokeWidth="5" strokeLinejoin="round" />
      {[[600, 870], [650, 905], [610, 950], [660, 990], [625, 1030]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="13" fill={i % 2 ? "#ffe14a" : "#12c2a4"} />)}
      <path d="M570 840 L690 840" stroke="#12c2a4" strokeWidth="9" opacity="0.85" />
      {/* headset: band, cup, boom mic */}
      <path d="M335 470 Q330 235 627 205 Q930 235 925 470" stroke="#23252b" strokeWidth="20" fill="none" strokeLinecap="round" />
      <rect x="296" y="450" width="64" height="130" rx="30" fill="#23252b" stroke="#000" strokeWidth="6" />
      <rect x="908" y="450" width="64" height="130" rx="30" fill="#23252b" stroke="#000" strokeWidth="6" />
      <path d="M312 575 Q320 700 520 690" stroke="#23252b" strokeWidth="14" fill="none" strokeLinecap="round" />
      <ellipse cx="545" cy="690" rx="34" ry="24" fill="#23252b" stroke="#000" strokeWidth="6" />
      <ellipse cx="552" cy="690" rx="14" ry="10" fill="#ff5a1f" />
    </g>
  );
};

/** fn keycap held in the right paw: small cap, three fingers wrapped over its lower edge. */
export const Keycap: React.FC<{ f: number }> = ({ f }) => (
  <g transform={`translate(0 ${Math.sin(f / 7) * 4})`}>
    <g transform="translate(800 845) scale(0.55) rotate(-8) translate(-905 -775)">
      <rect x="790" y="660" width="230" height="230" rx="38" fill="#9a9aa4" stroke={INK} strokeWidth="9" />
      <rect x="800" y="660" width="210" height="205" rx="32" fill="#f2f2f5" stroke={INK} strokeWidth="9" />
      <rect x="822" y="682" width="166" height="150" rx="24" fill="#fff" stroke="#d6d6de" strokeWidth="6" />
      <Txt x={905} y={790} textAnchor="middle" fontFamily={FONT_DISPLAY} fontWeight={900} fontSize={92} fill={INK}>fn</Txt>
      <circle cx="965" cy="705" r="9" fill="#8FE0BA" stroke={INK} strokeWidth="3" />
    </g>
    <ellipse cx="762" cy="906" rx="22" ry="26" fill="#b9692a" stroke="#3a2410" strokeWidth="7" />
    <ellipse cx="803" cy="914" rx="22" ry="26" fill="#b9692a" stroke="#3a2410" strokeWidth="7" />
    <ellipse cx="844" cy="906" rx="22" ry="26" fill="#b9692a" stroke="#3a2410" strokeWidth="7" />
  </g>
);
