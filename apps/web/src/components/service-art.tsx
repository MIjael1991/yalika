"use client";
import { useId } from "react";
/** Ilustraciones vectoriales: nítidas en móvil, sin descargas ni animaciones. */
export function ServiceArt({ kind }: { kind: string }) {
  const id = useId().replace(/:/g, ""),
    g = id + "-surface",
    bg = id + "-bg";
  const tones: Record<string, [string, string, string]> = {
    health: ["#ffe2e9", "#fff6f8", "#db4070"],
    pos: ["#ccf3e7", "#f1fff9", "#168769"],
    sites: ["#e5ddff", "#f7f5ff", "#7355d2"],
    surveys: ["#d7eaff", "#f3faff", "#347dd3"],
  };
  const [a, b, c] = tones[kind] ?? tones.surveys;
  return (
    <svg viewBox="0 0 240 150" fill="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient
          id={bg}
          x2="240"
          y2="150"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor={a} />
          <stop offset="1" stopColor={b} />
        </linearGradient>
        <linearGradient
          id={g}
          x1="60"
          y1="20"
          x2="180"
          y2="140"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="white" />
          <stop offset="1" stopColor={a} />
        </linearGradient>
      </defs>
      <rect width="240" height="150" rx="24" fill={`url(#${bg})`} />
      <circle
        cx="212"
        cy="16"
        r="55"
        stroke="white"
        strokeWidth="18"
        opacity=".5"
      />
      <circle cx="26" cy="135" r="34" fill="white" opacity=".45" />
      <ellipse cx="126" cy="128" rx="64" ry="9" fill={c} opacity=".12" />
      <g transform="rotate(-7 120 75)">
        {kind === "health" ? (
          <>
            <rect
              x="58"
              y="28"
              width="86"
              height="98"
              rx="16"
              fill={c}
              opacity=".18"
            />
            <rect
              x="64"
              y="20"
              width="86"
              height="98"
              rx="16"
              fill={`url(#${g})`}
              stroke="white"
              strokeWidth="3"
            />
            <rect x="87" y="16" width="38" height="14" rx="7" fill={c} />
            <path
              d="M81 58h18m-9-9v18"
              stroke={c}
              strokeWidth="6"
              strokeLinecap="round"
            />
            <path
              d="M80 85h40M80 98h25"
              stroke={c}
              strokeWidth="5"
              strokeLinecap="round"
              opacity=".25"
            />
            <path
              d="M160 110 132 85c-19-18 7-42 25-21l3 4 3-4c18-21 44 3 25 21Z"
              fill={c}
              stroke="white"
              strokeWidth="4"
            />
            <path
              d="m143 83 10 1 5-10 7 19 5-9h9"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        ) : kind === "pos" ? (
          <>
            <rect
              x="57"
              y="49"
              width="126"
              height="73"
              rx="12"
              fill={c}
              opacity=".18"
            />
            <rect
              x="62"
              y="42"
              width="118"
              height="75"
              rx="12"
              fill={`url(#${g})`}
              stroke="white"
              strokeWidth="3"
            />
            <path d="M62 46 71 26h99l10 20" fill={c} />
            <path
              d="m88 26-4 20m30-20-1 20m27-20 2 20m24-20 8 20"
              stroke="white"
              strokeWidth="12"
            />
            <path
              d="M62 46v7c0 11 23 11 23 0 0 11 24 11 24 0 0 11 24 11 24 0 0 11 24 11 24 0 0 11 23 11 23 0v-7"
              fill={c}
            />
            <rect
              x="75"
              y="73"
              width="42"
              height="29"
              rx="5"
              fill={a}
              stroke={c}
              strokeWidth="2"
            />
            <path d="M137 116V76h26v40" fill={a} stroke={c} strokeWidth="2" />
            <circle
              cx="184"
              cy="107"
              r="22"
              fill={c}
              stroke="white"
              strokeWidth="4"
            />
            <path
              d="m174 107 7 7 13-14"
              stroke="white"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        ) : kind === "sites" ? (
          <>
            <rect
              x="47"
              y="37"
              width="144"
              height="91"
              rx="14"
              fill={c}
              opacity=".2"
            />
            <rect
              x="53"
              y="29"
              width="139"
              height="89"
              rx="14"
              fill={`url(#${g})`}
              stroke="white"
              strokeWidth="3"
            />
            <path
              d="M54 49h137"
              stroke={c}
              strokeOpacity=".2"
              strokeWidth="2"
            />
            <circle cx="67" cy="39" r="3" fill={c} />
            <circle cx="78" cy="39" r="3" fill={c} opacity=".6" />
            <circle cx="89" cy="39" r="3" fill={c} opacity=".3" />
            <rect x="66" y="60" width="47" height="44" rx="7" fill={c} />
            <path d="m71 96 12-15 9 8 8-10 8 17" fill="white" opacity=".65" />
            <circle cx="100" cy="71" r="5" fill="white" opacity=".8" />
            <path
              d="M124 66h49m-49 12h34"
              stroke={c}
              strokeWidth="5"
              strokeLinecap="round"
              opacity=".3"
            />
            <rect x="124" y="89" width="41" height="13" rx="6.5" fill={c} />
            <path
              d="m180 86 4 40 10-12 15-5Z"
              fill={c}
              stroke="white"
              strokeWidth="3"
              strokeLinejoin="round"
            />
          </>
        ) : (
          <>
            <rect
              x="66"
              y="25"
              width="101"
              height="103"
              rx="16"
              fill={c}
              opacity=".18"
            />
            <rect
              x="72"
              y="17"
              width="101"
              height="103"
              rx="16"
              fill={`url(#${g})`}
              stroke="white"
              strokeWidth="3"
            />
            <path
              d="M91 36h62"
              stroke={c}
              strokeWidth="5"
              strokeLinecap="round"
              opacity=".3"
            />
            <rect
              x="90"
              y="79"
              width="14"
              height="24"
              rx="5"
              fill={c}
              opacity=".35"
            />
            <rect
              x="112"
              y="66"
              width="14"
              height="37"
              rx="5"
              fill={c}
              opacity=".65"
            />
            <rect x="134" y="51" width="14" height="52" rx="5" fill={c} />
            <circle
              cx="177"
              cy="104"
              r="24"
              fill={c}
              stroke="white"
              strokeWidth="4"
            />
            <path
              d="m166 104 8 8 14-16"
              stroke="white"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        )}
      </g>
      <path d="m35 38 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" fill={c} opacity=".5" />
      <circle cx="207" cy="69" r="4" fill={c} opacity=".35" />
    </svg>
  );
}
