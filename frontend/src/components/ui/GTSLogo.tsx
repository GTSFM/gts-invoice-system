import React from 'react';

export function GTSLogo({ className = 'h-10' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <svg viewBox="0 0 200 80" className="h-full w-auto" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Background Purple Box */}
        <rect width="200" height="80" rx="4" fill="#3B2A7A" />
        
        {/* Two Interlocking Rings */}
        <circle cx="48" cy="40" r="24" stroke="white" strokeWidth="5.5" />
        <circle cx="76" cy="40" r="24" stroke="white" strokeWidth="5.5" />

        {/* Text 'GtS' styled to match corporate branding */}
        <text
          x="115"
          y="49"
          fontFamily="Georgia, serif"
          fontSize="36"
          fontWeight="bold"
          fill="white"
          letterSpacing="-1"
        >
          G<tspan fontSize="28" dy="2">t</tspan><tspan fontSize="36" dy="-2">S</tspan>
        </text>
      </svg>
    </div>
  );
}

export default GTSLogo;
