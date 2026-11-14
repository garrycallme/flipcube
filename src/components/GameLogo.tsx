import React from 'react';

export const GameLogo: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  return (
    <div className="flex items-center gap-3.5 select-none">
      <svg
        width={compact ? 36 : 52}
        height={compact ? 36 : 52}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        {/* Top Gold Face */}
        <path
          d="M32 6L56 19L32 32L8 19L32 6Z"
          fill="#FBBF24"
          stroke="#FEF08A"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {/* Left Cyan Face */}
        <path
          d="M8 19L32 32V58L8 45V19Z"
          fill="#0891B2"
          stroke="#22D3EE"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {/* Right Deep Slate Face */}
        <path
          d="M56 19L32 32V58L56 45V19Z"
          fill="#1E293B"
          stroke="#64748B"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {/* Top Diamond Inlay */}
        <path
          d="M32 13L42 19L32 25L22 19L32 13Z"
          fill="#FFFBEB"
        />
        {/* Left Ring Inlay */}
        <circle cx="20" cy="38" r="5.5" stroke="#CFFAFE" strokeWidth="2.4" />
      </svg>
      <div className="flex flex-col">
        <span
          className={`font-display font-extrabold tracking-tight text-white leading-none ${
            compact ? 'text-xl' : 'text-4xl sm:text-5xl'
          }`}
        >
          CUBE <span className="text-amber-400">FLIP</span>
        </span>
        {!compact && (
          <span className="text-xs sm:text-sm text-slate-400 tracking-wide mt-1">
            Isometric Rolling Puzzle Arcade
          </span>
        )}
      </div>
    </div>
  );
};
