import { useId } from 'react';
import type { CompanionMood } from '@nutripals/core';

export interface CompanionAccessories {
  hat?: string;
  scarf?: string;
  face?: string;
  backdrop?: string;
}

interface KitoProps {
  mood?: CompanionMood;
  accessories?: CompanionAccessories;
  size?: number;
  animate?: boolean;
  className?: string;
}

/**
 * Kito — an original round forest fox drawn for NutriPals.
 * Shapes are deliberately simple so expressions stay legible at small sizes.
 */
export function Companion({ mood = 'happy', accessories = {}, size = 240, animate = true, className = '' }: KitoProps) {
  const id = useId().replace(/:/g, '');
  const scarfColor =
    accessories.scarf === 'scarf_sun' ? '#ec9640' : accessories.scarf === 'scarf_crown' ? '#d9a526' : '#2f8f5b';
  const scarfLight = accessories.scarf === 'scarf_sun' ? '#f7c58a' : accessories.scarf === 'scarf_crown' ? '#f6df9a' : '#7cc49a';

  const eyes = (() => {
    switch (mood) {
      case 'resting':
        return (
          <>
            <path d="M44 86c4 4 9 4 13 0" stroke="#24332d" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M83 86c4 4 9 4 13 0" stroke="#24332d" strokeWidth="3" fill="none" strokeLinecap="round" />
          </>
        );
      case 'celebrating':
        return (
          <>
            <path d="M43 84c4-7 14-7 18 0" stroke="#24332d" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M79 84c4-7 14-7 18 0" stroke="#24332d" strokeWidth="3" fill="none" strokeLinecap="round" />
          </>
        );
      case 'thinking':
        return (
          <>
            <circle cx="50" cy="82" r="5.5" fill="#24332d" />
            <circle cx="88" cy="82" r="5.5" fill="#24332d" />
            <circle cx="52" cy="80" r="1.8" fill="#fff" />
            <circle cx="90" cy="80" r="1.8" fill="#fff" />
            <path d="M52 70c4-3 9-3 12 0" stroke="#24332d" strokeWidth="2" fill="none" strokeLinecap="round" />
          </>
        );
      case 'reminder':
      case 'curious':
        return (
          <>
            <circle cx="50" cy="82" r="6.5" fill="#24332d" />
            <circle cx="88" cy="82" r="6.5" fill="#24332d" />
            <circle cx="52.5" cy="79.5" r="2.2" fill="#fff" />
            <circle cx="90.5" cy="79.5" r="2.2" fill="#fff" />
            <path d="M78 68c4-4 10-4 14-1" stroke="#24332d" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          </>
        );
      default:
        return (
          <>
            <circle cx="50" cy="82" r="6" fill="#24332d" />
            <circle cx="88" cy="82" r="6" fill="#24332d" />
            <circle cx="52" cy="79.5" r="2" fill="#fff" />
            <circle cx="90" cy="79.5" r="2" fill="#fff" />
          </>
        );
    }
  })();

  const mouth = (() => {
    if (mood === 'celebrating' || mood === 'encouraging' || mood === 'happy') {
      return <path d="M58 100c5 9 18 9 23 0" stroke="#24332d" strokeWidth="3" fill="#c2554f" strokeLinecap="round" />;
    }
    if (mood === 'thinking') return <path d="M63 102c5 2 10 2 14-1" stroke="#24332d" strokeWidth="3" fill="none" strokeLinecap="round" />;
    if (mood === 'resting') return <path d="M64 101c4 3 9 3 12 0" stroke="#24332d" strokeWidth="3" fill="none" strokeLinecap="round" />;
    return <path d="M64 100c3 4 9 4 12 0" stroke="#24332d" strokeWidth="3" fill="none" strokeLinecap="round" />;
  })();

  return (
    <svg
      viewBox="0 0 140 150"
      width={size}
      height={Math.round((size * 150) / 140)}
      className={`kito ${animate ? 'kito-bounce' : ''} ${className}`}
      role="img"
      aria-label={`Kito the forest fox, looking ${mood}`}
    >
      <defs>
        <linearGradient id={`fur-${id}`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#f9e7c3" />
          <stop offset="1" stopColor="#efd3a3" />
        </linearGradient>
        <linearGradient id={`belly-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fffaf0" />
          <stop offset="1" stopColor="#f7ecd8" />
        </linearGradient>
      </defs>

      {/* tail */}
      <path
        d="M104 122c18 2 25-10 21-21-3-9-14-11-19-4 7 1 11 6 10 11-1 6-7 9-14 7z"
        fill={`url(#fur-${id})`}
        stroke="#d7b586"
        strokeWidth="1.2"
      />
      <path d="M111 103c4-1 8 1 9 5" stroke="#fdf4e3" strokeWidth="4" strokeLinecap="round" fill="none" />

      {/* ears */}
      <path d="M30 60C19 36 24 17 37 14c13-3 24 17 25 38z" fill={`url(#fur-${id})`} stroke="#d7b586" strokeWidth="1.2" />
      <path d="M110 60c11-24 6-43-7-46-13-3-24 17-25 38z" fill={`url(#fur-${id})`} stroke="#d7b586" strokeWidth="1.2" />
      <path d="M36 53c-6-16-3-27 4-29 8-2 14 12 15 25z" fill="#f2b8a0" opacity="0.9" />
      <path d="M104 53c6-16 3-27-4-29-8-2-14 12-15 25z" fill="#f2b8a0" opacity="0.9" />

      {/* body */}
      <ellipse cx="70" cy="108" rx="35" ry="34" fill={`url(#fur-${id})`} stroke="#d7b586" strokeWidth="1.2" />
      <ellipse cx="70" cy="114" rx="22" ry="23" fill={`url(#belly-${id})`} />

      {/* head */}
      <ellipse cx="70" cy="82" rx="34" ry="31" fill={`url(#fur-${id})`} stroke="#d7b586" strokeWidth="1.2" />
      <ellipse cx="70" cy="92" rx="20" ry="16" fill={`url(#belly-${id})`} />

      {/* cheeks */}
      <ellipse cx="46" cy="92" rx="6" ry="3.5" fill="#f0b3a0" opacity="0.55" />
      <ellipse cx="94" cy="92" rx="6" ry="3.5" fill="#f0b3a0" opacity="0.55" />

      {eyes}
      <path d="M67 92c-3 0-4.5 2.4-2.4 4.2 1.3 1.1 3.7 1.1 5 0 2.1-1.8.6-4.2-2.6-4.2z" fill="#d97a63" />
      {mouth}

      {/* paws */}
      <ellipse cx="48" cy="128" rx="10" ry="6.5" fill={`url(#fur-${id})`} stroke="#d7b586" strokeWidth="1" />
      <ellipse cx="92" cy="128" rx="10" ry="6.5" fill={`url(#fur-${id})`} stroke="#d7b586" strokeWidth="1" />

      {/* scarf */}
      <path d="M43 106c9 7 45 7 54 0l-2 8c-12 6-38 6-50 0z" fill={scarfColor} />
      <path d="M95 112c6 3 8 9 6 15l-8-2c2-4 1-8-1-11z" fill={scarfLight} />
      <circle cx="68" cy="110" r="2.4" fill={scarfLight} />

      {/* glasses */}
      {accessories.face === 'face_glasses' ? (
        <g fill="none" stroke="#4a5a53" strokeWidth="2">
          <circle cx="50" cy="82" r="11" />
          <circle cx="88" cy="82" r="11" />
          <path d="M61 82h16" />
          <path d="M39 80l-7-3M99 80l7-3" />
        </g>
      ) : null}

      {/* hats */}
      {accessories.hat === 'hat_acorn' ? (
        <g>
          <path d="M56 44c0-10 6-16 14-16s14 6 14 16z" fill="#a9743f" />
          <path d="M54 44h32v4c0 3-2 5-5 5H59c-3 0-5-2-5-5z" fill="#8a5a2e" />
          <path d="M69 28c2-5 6-7 9-6-2 3-2 6-1 8z" fill="#7f9b56" />
        </g>
      ) : null}
      {accessories.hat === 'hat_sprout' ? (
        <g>
          <path d="M70 45c-1-9-8-13-15-11 1 8 7 12 15 11z" fill="#4f9a63" />
          <path d="M70 45c1-9 8-13 15-11-1 8-7 12-15 11z" fill="#60b073" />
          <path d="M70 45v9" stroke="#4f9a63" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      ) : null}

      {/* mood extras */}
      {mood === 'celebrating' ? (
        <g fill="#ec9640">
          <circle cx="20" cy="40" r="2.4" />
          <circle cx="122" cy="46" r="2.8" />
          <circle cx="118" cy="22" r="1.8" />
          <circle cx="24" cy="80" r="1.8" />
          <path d="M108 66l1.4 3.8 3.8 1.4-3.8 1.4-1.4 3.8-1.4-3.8-3.8-1.4 3.8-1.4z" />
        </g>
      ) : null}
      {mood === 'resting' ? (
        <g fill="#6d7c74" fontSize="8" fontWeight="800" aria-hidden="true">
          <text x="106" y="58">z</text>
          <text x="114" y="48">z</text>
        </g>
      ) : null}
      {mood === 'thinking' ? (
        <g>
          <circle cx="110" cy="48" r="6" fill="#fffaf0" stroke="#d7b586" />
          <circle cx="118" cy="38" r="3" fill="#fffaf0" stroke="#d7b586" />
        </g>
      ) : null}

      {/* encouragement paw */}
      {mood === 'encouraging' ? (
        <g>
          <ellipse cx="104" cy="106" rx="8" ry="9" fill={`url(#fur-${id})`} stroke="#d7b586" transform="rotate(24 104 106)" />
          <path d="M101 101v10M105 100v11M109 102v8" stroke="#d7b586" strokeWidth="1.2" strokeLinecap="round" />
        </g>
      ) : null}
    </svg>
  );
}
