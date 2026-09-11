import React, { memo } from 'react';

export type SectionGlowVariant = 'saved' | 'inbox' | 'reddit' | 'radio';

interface SectionGlowProps {
  variant: SectionGlowVariant;
  themeColorRgb?: string;
  className?: string;
}

export const SectionGlow: React.FC<SectionGlowProps> = memo(({
  variant,
  themeColorRgb = '59, 130, 246',
  className = '',
}) => {
  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden select-none -z-0 transform-gpu will-change-transform ${className}`}
      aria-hidden="true"
    >
      {variant === 'saved' && (
        <>
          {/* Primary Top Golden Amber Glow */}
          <div
            className="absolute -top-[12%] left-1/2 -translate-x-1/2 w-[110%] h-[55%] rounded-full blur-[90px] opacity-80 dark:opacity-75 transition-opacity duration-700 transform-gpu"
            style={{
              background: 'radial-gradient(ellipse at center, rgba(245, 158, 11, 0.22) 0%, rgba(217, 119, 6, 0.12) 45%, transparent 75%)',
            }}
          />
          {/* Secondary Ambient Honey Bloom */}
          <div
            className="absolute top-[35%] -right-[15%] w-[65vw] h-[45vh] rounded-full blur-[100px] opacity-70 dark:opacity-60 transition-opacity duration-700 transform-gpu"
            style={{
              background: 'radial-gradient(circle at center, rgba(234, 179, 8, 0.16) 0%, rgba(245, 158, 11, 0.06) 50%, transparent 80%)',
            }}
          />
          {/* Lower Warm Grounding Glow */}
          <div
            className="absolute -bottom-[10%] -left-[10%] w-[60vw] h-[40vh] rounded-full blur-[90px] opacity-60 dark:opacity-50 transition-opacity duration-700 transform-gpu"
            style={{
              background: 'radial-gradient(circle at center, rgba(217, 119, 6, 0.14) 0%, transparent 70%)',
            }}
          />
        </>
      )}

      {variant === 'inbox' && (
        <>
          {/* Primary Top Theme / Electric Blue Glow */}
          <div
            className="absolute -top-[14%] left-1/2 -translate-x-1/2 w-[115%] h-[58%] rounded-full blur-[90px] opacity-85 dark:opacity-80 transition-opacity duration-700 transform-gpu"
            style={{
              background: `radial-gradient(ellipse at center, rgba(${themeColorRgb}, 0.24) 0%, rgba(79, 70, 229, 0.12) 45%, transparent 75%)`,
            }}
          />
          {/* Lateral Cobalt / Indigo Accent */}
          <div
            className="absolute top-[30%] -left-[15%] w-[60vw] h-[45vh] rounded-full blur-[100px] opacity-70 dark:opacity-60 transition-opacity duration-700 transform-gpu"
            style={{
              background: `radial-gradient(circle at center, rgba(${themeColorRgb}, 0.16) 0%, rgba(59, 130, 246, 0.06) 50%, transparent 75%)`,
            }}
          />
          {/* Deep Lower Violet Mist */}
          <div
            className="absolute -bottom-[12%] -right-[10%] w-[65vw] h-[45vh] rounded-full blur-[90px] opacity-65 dark:opacity-55 transition-opacity duration-700 transform-gpu"
            style={{
              background: 'radial-gradient(circle at center, rgba(99, 102, 241, 0.15) 0%, transparent 70%)',
            }}
          />
        </>
      )}

      {variant === 'reddit' && (
        <>
          {/* Primary Cosmic Violet Glow */}
          <div
            className="absolute -top-[12%] left-1/2 -translate-x-1/2 w-[110%] h-[55%] rounded-full blur-[90px] opacity-85 dark:opacity-80 transition-opacity duration-700 transform-gpu"
            style={{
              background: 'radial-gradient(ellipse at center, rgba(168, 85, 247, 0.24) 0%, rgba(147, 51, 234, 0.12) 45%, transparent 75%)',
            }}
          />
          {/* Flame Orange Radiant Accent (Reddit Signature) */}
          <div
            className="absolute top-[25%] -right-[12%] w-[60vw] h-[45vh] rounded-full blur-[100px] opacity-75 dark:opacity-65 transition-opacity duration-700 transform-gpu"
            style={{
              background: 'radial-gradient(circle at center, rgba(249, 115, 22, 0.18) 0%, rgba(234, 88, 12, 0.07) 50%, transparent 75%)',
            }}
          />
          {/* Bottom-Left Fuchsia / Purple Aurora */}
          <div
            className="absolute -bottom-[10%] -left-[10%] w-[65vw] h-[42vh] rounded-full blur-[90px] opacity-65 dark:opacity-55 transition-opacity duration-700 transform-gpu"
            style={{
              background: 'radial-gradient(circle at center, rgba(192, 38, 211, 0.15) 0%, transparent 70%)',
            }}
          />
        </>
      )}

      {variant === 'radio' && (
        <>
          {/* Primary Crimson Ruby Soundwave Glow */}
          <div
            className="absolute -top-[12%] left-1/2 -translate-x-1/2 w-[110%] h-[58%] rounded-full blur-[90px] opacity-85 dark:opacity-80 transition-opacity duration-700 transform-gpu"
            style={{
              background: 'radial-gradient(ellipse at center, rgba(239, 68, 68, 0.26) 0%, rgba(244, 63, 94, 0.13) 45%, transparent 75%)',
            }}
          />
          {/* Studio Broadcast Ambient Live Pulse */}
          <div
            className="absolute top-[32%] -left-[15%] w-[65vw] h-[45vh] rounded-full blur-[100px] opacity-75 dark:opacity-65 transition-opacity duration-700 transform-gpu"
            style={{
              background: 'radial-gradient(circle at center, rgba(225, 29, 72, 0.18) 0%, rgba(239, 68, 68, 0.07) 50%, transparent 75%)',
            }}
          />
          {/* Sunset Rose Grounding Bloom */}
          <div
            className="absolute -bottom-[12%] -right-[12%] w-[65vw] h-[42vh] rounded-full blur-[90px] opacity-65 dark:opacity-55 transition-opacity duration-700 transform-gpu"
            style={{
              background: 'radial-gradient(circle at center, rgba(251, 113, 133, 0.16) 0%, transparent 70%)',
            }}
          />
        </>
      )}
    </div>
  );
});

SectionGlow.displayName = 'SectionGlow';
