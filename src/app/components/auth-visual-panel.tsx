export function AuthVisualPanel({ isDarkMode }: { isDarkMode: boolean }) {
  return (
    <div className="hidden lg:flex absolute top-0 bottom-0 right-0 w-[54%] rounded-l-[32px] shadow-2xl z-20 border border-white/15 overflow-hidden bg-[#131a2b]">
      <PaperFacets />
      <div className={`absolute inset-0 ${isDarkMode ? "bg-black/10" : "bg-white/10"}`} />
      <div className="relative z-10 w-full h-full flex items-center justify-center">
        <div className="bg-white/95 backdrop-blur-sm rounded-full p-8 shadow-2xl">
          <BookGlyph />
        </div>
      </div>
    </div>
  );
}

function PaperFacets() {
  return (
    <svg
      className="absolute inset-0 w-full h-full"
      viewBox="0 0 900 1000"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="navyBase" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1c2540" />
          <stop offset="100%" stopColor="#0f1526" />
        </linearGradient>
        <linearGradient id="tealA" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#5c8479" />
          <stop offset="100%" stopColor="#33544c" />
        </linearGradient>
        <linearGradient id="tealB" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#3f5f57" />
          <stop offset="100%" stopColor="#6b9086" />
        </linearGradient>
        <linearGradient id="slateA" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#33436a" />
          <stop offset="100%" stopColor="#1c2740" />
        </linearGradient>
        <linearGradient id="slateB" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#26314f" />
          <stop offset="100%" stopColor="#151d33" />
        </linearGradient>
        <linearGradient id="plumA" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#5a4a5c" />
          <stop offset="100%" stopColor="#332a3d" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="900" height="1000" fill="url(#navyBase)" />
      <polygon points="90,-40 640,-40 480,340 -60,300" fill="url(#tealA)" />
      <polygon points="330,-40 950,-40 780,270 260,320" fill="url(#tealB)" opacity="0.92" />
      <polygon points="-60,260 470,240 610,600 -60,700" fill="url(#slateA)" opacity="0.95" />
      <polygon points="380,520 960,470 960,1040 300,1040" fill="url(#slateB)" />
      <polygon points="620,760 960,700 960,1040 640,1040" fill="url(#plumA)" opacity="0.85" />

      <polygon
        points="90,-40 640,-40 480,340 -60,300"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.06"
        strokeWidth="2"
      />
      <polygon
        points="-60,260 470,240 610,600 -60,700"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.05"
        strokeWidth="2"
      />
    </svg>
  );
}

function BookGlyph() {
  return (
    <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="#0084D1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}
