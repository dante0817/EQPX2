import React, { useId } from 'react';

interface IconProps {
  className?: string;
  active?: boolean;
}

export const PlotGlobe3DIcon: React.FC<IconProps & { locating?: boolean }> = ({
  className = 'w-7 h-7',
  locating = false,
}) => {
  const uid = useId().replace(/:/g, '');
  return (
    <svg
      viewBox="0 0 36 36"
      className={`${className} ${locating ? 'animate-spin' : 'eqp-icon-3d'} drop-shadow-[0_2px_2px_rgba(15,23,42,0.28)]`}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={`${uid}-sea`} cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#7dd3fc" />
          <stop offset="42%" stopColor="#0284c7" />
          <stop offset="100%" stopColor="#0f296b" />
        </radialGradient>
        <linearGradient id={`${uid}-land`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#bef264" />
          <stop offset="55%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#15803d" />
        </linearGradient>
        <linearGradient id={`${uid}-ring`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fde047" />
          <stop offset="55%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#dc2626" />
        </linearGradient>
        <radialGradient id={`${uid}-gloss`} cx="32%" cy="22%" r="55%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.78" />
          <stop offset="65%" stopColor="#ffffff" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Globe sphere */}
      <circle cx="18" cy="18" r="13.5" fill={`url(#${uid}-sea)`} stroke="#0c234d" strokeWidth="1.2" />
      {/* Latitude/longitude lines */}
      <ellipse cx="18" cy="18" rx="6.8" ry="13.2" fill="none" stroke="#bae6fd" strokeOpacity="0.45" strokeWidth="0.9" />
      <path d="M5 18 H31 M7 12.2 H29 M7 23.8 H29" stroke="#bae6fd" strokeOpacity="0.4" strokeWidth="0.85" />
      {/* Archipelago landmass shapes */}
      <path
        d="M15 9.2c1.6-.4 3.2.4 3.5 1.9.3 1.4-1.2 2.4-1.6 3.7-.3 1 .8 1.9.4 3-.5 1.3-2.2 1.2-3 .1-.7-1-.6-2.4-.2-3.6.4-1.4-.4-4.7.9-5.1Z"
        fill={`url(#${uid}-land)`}
        stroke="#14532d"
        strokeWidth="0.6"
      />
      <path
        d="M21.2 16.4c1.3-.3 2.8.8 3.2 2.3.4 1.4-.3 3.2-1.7 3.7-1.2.4-2.6-.7-2.7-2-.1-1.3.1-3.7 1.2-4Z"
        fill={`url(#${uid}-land)`}
        stroke="#14532d"
        strokeWidth="0.6"
      />
      <path
        d="M11.8 20.5c1.1-.2 2.2.7 2.4 1.8.2 1.2-.8 2.4-2 2.4-1.2 0-1.9-1.2-1.8-2.3.1-.9.5-1.7 1.4-1.9Z"
        fill={`url(#${uid}-land)`}
        stroke="#14532d"
        strokeWidth="0.55"
      />
      {/* Specular dome gloss */}
      <ellipse cx="15" cy="12" rx="9" ry="6.2" fill={`url(#${uid}-gloss)`} />
      {/* Epicenter starburst target */}
      <circle cx="23.5" cy="13.5" r="5.2" fill="none" stroke={`url(#${uid}-ring)`} strokeWidth="1.4" />
      <circle cx="23.5" cy="13.5" r="2.6" fill="#fef08a" stroke="#dc2626" strokeWidth="1.1" />
    </svg>
  );
};

export const LocateCrosshair3DIcon: React.FC<IconProps> = ({ className = 'w-7 h-7' }) => {
  const uid = useId().replace(/:/g, '');
  return (
    <svg
      viewBox="0 0 36 36"
      className={`${className} eqp-icon-3d drop-shadow-[0_2px_2px_rgba(15,23,42,0.26)]`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${uid}-rim`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="45%" stopColor="#94a3b8" />
          <stop offset="100%" stopColor="#334155" />
        </linearGradient>
        <radialGradient id={`${uid}-lens`} cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="45%" stopColor="#e0f2fe" />
          <stop offset="100%" stopColor="#7dd3fc" />
        </radialGradient>
        <linearGradient id={`${uid}-pin`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fb7185" />
          <stop offset="55%" stopColor="#ef4444" />
          <stop offset="100%" stopColor="#991b1b" />
        </linearGradient>
        <linearGradient id={`${uid}-handle`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="50%" stopColor="#d97706" />
          <stop offset="100%" stopColor="#78350f" />
        </linearGradient>
      </defs>
      {/* Magnifier Handle */}
      <path
        d="M22.2 22.2 L31 31"
        stroke="#451a03"
        strokeWidth="5.4"
        strokeLinecap="round"
      />
      <path
        d="M22.2 22.2 L31 31"
        stroke={`url(#${uid}-handle)`}
        strokeWidth="3.8"
        strokeLinecap="round"
      />
      {/* Magnifier Rim & Glass */}
      <circle cx="15.5" cy="15.5" r="10.8" fill={`url(#${uid}-rim)`} stroke="#1e293b" strokeWidth="1" />
      <circle cx="15.5" cy="15.5" r="8.2" fill={`url(#${uid}-lens)`} stroke="#0369a1" strokeWidth="0.8" />
      {/* Crosshair lines */}
      <path d="M15.5 8.2 V11.4 M15.5 19.6 V22.8 M8.2 15.5 H11.4 M19.6 15.5 H22.8" stroke="#0284c7" strokeWidth="1.2" strokeLinecap="round" />
      {/* 3D Map Pin inside lens */}
      <path
        d="M15.5 9.8c-2.3 0-4.1 1.8-4.1 4 0 2.9 4.1 6.7 4.1 6.7s4.1-3.8 4.1-6.7c0-2.2-1.8-4-4.1-4Z"
        fill={`url(#${uid}-pin)`}
        stroke="#7f1d1d"
        strokeWidth="0.7"
      />
      <circle cx="15.5" cy="13.7" r="1.5" fill="#fef08a" />
      {/* Top lens gloss */}
      <path d="M10.5 11.2a6 6 0 0 1 7.6-2.4" fill="none" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.85" />
    </svg>
  );
};

export const MagnitudeSeismic3DIcon: React.FC<IconProps> = ({ className = 'w-7 h-7' }) => {
  const uid = useId().replace(/:/g, '');
  return (
    <svg
      viewBox="0 0 36 36"
      className={`${className} eqp-icon-3d drop-shadow-[0_2px_2px_rgba(15,23,42,0.28)]`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${uid}-bezel`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#e2e8f0" />
          <stop offset="50%" stopColor="#94a3b8" />
          <stop offset="100%" stopColor="#475569" />
        </linearGradient>
        <linearGradient id={`${uid}-screen`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0f172a" />
          <stop offset="60%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#064e3b" />
        </linearGradient>
        <linearGradient id={`${uid}-wave`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="50%" stopColor="#fde047" />
          <stop offset="100%" stopColor="#fb7185" />
        </linearGradient>
      </defs>
      {/* 3D Oscilloscope Chassis */}
      <rect x="3.5" y="5.5" width="29" height="25" rx="4" fill={`url(#${uid}-bezel)`} stroke="#1e293b" strokeWidth="1.1" />
      <rect x="6" y="8" width="24" height="19" rx="2.5" fill={`url(#${uid}-screen)`} stroke="#0f172a" strokeWidth="1" />
      {/* Subtle CRT grid */}
      <path d="M6 17.5 H30 M18 8 V27" stroke="#10b981" strokeOpacity="0.24" strokeWidth="0.7" />
      {/* Vibrant Seismic Waveform */}
      <path
        d="M7.5 17.5 H11 L13 13 L15 22 L17.6 10.2 L20.2 24.4 L22.5 14 L24.5 19.5 L26 17.5 H28.8"
        fill="none"
        stroke={`url(#${uid}-wave)`}
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Peak node sparkle */}
      <circle cx="17.6" cy="10.2" r="1.7" fill="#fef08a" stroke="#f97316" strokeWidth="0.8" />
      {/* Glass screen top gloss */}
      <path d="M7.5 9.2 H28.5 L27 12.2 H8.2 Z" fill="#ffffff" fillOpacity="0.14" />
    </svg>
  );
};

export const BulletinDoc3DIcon: React.FC<IconProps> = ({ className = 'w-7 h-7' }) => {
  const uid = useId().replace(/:/g, '');
  return (
    <svg
      viewBox="0 0 36 36"
      className={`${className} eqp-icon-3d drop-shadow-[0_2px_2px_rgba(15,23,42,0.26)]`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${uid}-paper`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="65%" stopColor="#f8fafc" />
          <stop offset="100%" stopColor="#cbd5e1" />
        </linearGradient>
        <linearGradient id={`${uid}-hdr`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#1d4ed8" />
          <stop offset="100%" stopColor="#0ea5e9" />
        </linearGradient>
        <linearGradient id={`${uid}-seal`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="55%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
      </defs>
      {/* Back Stacked Sheet */}
      <rect x="8.5" y="4" width="21" height="26.5" rx="2.2" fill="#dbeafe" stroke="#475569" strokeWidth="0.9" />
      {/* Front Official Sheet */}
      <path
        d="M6.5 6.5 H22 L26.5 11 V31.5 H6.5 Z"
        fill={`url(#${uid}-paper)`}
        stroke="#1e293b"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      {/* Corner fold */}
      <path d="M22 6.5 V11 H26.5 Z" fill="#93c5fd" stroke="#1e293b" strokeWidth="0.9" strokeLinejoin="round" />
      {/* Blue Header Banner */}
      <rect x="8.2" y="8.5" width="12.5" height="3.6" rx="0.8" fill={`url(#${uid}-hdr)`} />
      {/* Mini bulletin waveform & text lines */}
      <path d="M8.5 16 H11 L12.5 14 L14 18 L15.5 15.2 L17 16 H23.5" fill="none" stroke="#dc2626" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.5 21 H23.8 M8.5 24.5 H20 M8.5 28 H17" stroke="#475569" strokeWidth="1.4" strokeLinecap="round" />
      {/* Gold Seal Badge */}
      <circle cx="24" cy="26.5" r="5" fill={`url(#${uid}-seal)`} stroke="#78350f" strokeWidth="0.9" />
      <path d="M24 23.6 L24.8 25.4 L26.8 25.6 L25.3 26.9 L25.7 28.8 L24 27.8 L22.3 28.8 L22.7 26.9 L21.2 25.6 L23.2 25.4 Z" fill="#fffbeb" />
    </svg>
  );
};

export const WebPageGlobe3DIcon: React.FC<IconProps> = ({ className = 'w-7 h-7' }) => {
  const uid = useId().replace(/:/g, '');
  return (
    <svg
      viewBox="0 0 36 36"
      className={`${className} eqp-icon-3d drop-shadow-[0_2px_2px_rgba(15,23,42,0.26)]`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${uid}-win`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#dbeafe" />
        </linearGradient>
        <linearGradient id={`${uid}-top`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#0369a1" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>
        <radialGradient id={`${uid}-orb`} cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#67e8f9" />
          <stop offset="55%" stopColor="#0284c7" />
          <stop offset="100%" stopColor="#1e3a8a" />
        </radialGradient>
      </defs>
      {/* Browser Card */}
      <rect x="4" y="5.5" width="26" height="22" rx="3" fill={`url(#${uid}-win)`} stroke="#1e293b" strokeWidth="1.1" />
      <path d="M4 8.5 A3 3 0 0 1 7 5.5 H27 A3 3 0 0 1 30 8.5 V11 H4 Z" fill={`url(#${uid}-top)`} stroke="#1e293b" strokeWidth="1" />
      {/* Window traffic dots */}
      <circle cx="7.5" cy="8.3" r="1" fill="#fca5a5" />
      <circle cx="10.5" cy="8.3" r="1" fill="#fde047" />
      <circle cx="13.5" cy="8.3" r="1" fill="#86efac" />
      {/* Page bars */}
      <rect x="6.8" y="13.5" width="12" height="2.4" rx="0.8" fill="#0284c7" fillOpacity="0.8" />
      <path d="M6.8 18.5 H16 M6.8 21.5 H14.5 M6.8 24.5 H13" stroke="#64748b" strokeWidth="1.4" strokeLinecap="round" />
      {/* 3D Web Globe Overlay */}
      <circle cx="24.5" cy="23.5" r="7.5" fill={`url(#${uid}-orb)`} stroke="#0c234d" strokeWidth="1" />
      <ellipse cx="24.5" cy="23.5" rx="3.4" ry="7.2" fill="none" stroke="#bae6fd" strokeWidth="0.9" />
      <path d="M17.5 23.5 H31.5 M18.8 20 H30.2 M18.8 27 H30.2" stroke="#bae6fd" strokeWidth="0.85" />
      <ellipse cx="22.5" cy="20.2" rx="3.5" ry="2" fill="#ffffff" fillOpacity="0.45" />
    </svg>
  );
};

/* --- Toolbar 3D Glossy Icons (18x18 / w-4 h-4) --- */

export const NewFile3DIcon: React.FC<IconProps> = ({ className = 'w-4 h-4' }) => {
  const uid = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 24 24" className={`${className} eqp-icon-3d shrink-0`} aria-hidden="true">
      <defs>
        <linearGradient id={`${uid}-p`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#cbd5e1" />
        </linearGradient>
        <radialGradient id={`${uid}-plus`} cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#86efac" />
          <stop offset="55%" stopColor="#16a34a" />
          <stop offset="100%" stopColor="#14532d" />
        </radialGradient>
      </defs>
      <path d="M5 2.5 H14 L18.5 7 V20.5 H5 Z" fill={`url(#${uid}-p)`} stroke="#1e293b" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M14 2.5 V7 H18.5 Z" fill="#93c5fd" stroke="#1e293b" strokeWidth="1" strokeLinejoin="round" />
      <path d="M8 10 H15 M8 13.5 H13 M8 17 H12" stroke="#475569" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="17" cy="17" r="5" fill={`url(#${uid}-plus)`} stroke="#052e16" strokeWidth="1" />
      <path d="M17 14.5 V19.5 M14.5 17 H19.5" stroke="#ffffff" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
};

export const OpenFolder3DIcon: React.FC<IconProps> = ({ className = 'w-4 h-4' }) => {
  const uid = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 24 24" className={`${className} eqp-icon-3d shrink-0`} aria-hidden="true">
      <defs>
        <linearGradient id={`${uid}-back`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
        <linearGradient id={`${uid}-front`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="55%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#d97706" />
        </linearGradient>
      </defs>
      <path d="M2.5 6 C2.5 5 3.3 4.2 4.3 4.2 H9.2 L11 6.2 H19.5 C20.5 6.2 21.2 7 21.2 8 V18.5 H2.5 Z" fill={`url(#${uid}-back)`} stroke="#78350f" strokeWidth="1.1" strokeLinejoin="round" />
      <rect x="6" y="7.5" width="12" height="5" rx="0.8" fill="#ffffff" stroke="#94a3b8" strokeWidth="0.7" />
      <path d="M2.5 10.5 H21.5 L19.6 19.8 H4.2 Z" fill={`url(#${uid}-front)`} stroke="#78350f" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M4.2 11.6 H19.8" stroke="#ffffff" strokeOpacity="0.65" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
};

export const SaveDisk3DIcon: React.FC<IconProps> = ({ className = 'w-4 h-4' }) => {
  const uid = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 24 24" className={`${className} eqp-icon-3d shrink-0`} aria-hidden="true">
      <defs>
        <linearGradient id={`${uid}-body`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="50%" stopColor="#1d4ed8" />
          <stop offset="100%" stopColor="#1e3a8a" />
        </linearGradient>
        <linearGradient id={`${uid}-metal`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="100%" stopColor="#94a3b8" />
        </linearGradient>
      </defs>
      <path d="M3.5 3.5 H17.5 L20.5 6.5 V20.5 H3.5 Z" fill={`url(#${uid}-body)`} stroke="#0f172a" strokeWidth="1.1" strokeLinejoin="round" />
      <rect x="7" y="3.5" width="9" height="6" fill={`url(#${uid}-metal)`} stroke="#334155" strokeWidth="0.8" />
      <rect x="12.5" y="4.8" width="2" height="3.5" fill="#1e293b" />
      <rect x="6" y="12.5" width="12" height="8" rx="0.8" fill="#ffffff" stroke="#334155" strokeWidth="0.8" />
      <path d="M8 15 H16 M8 17.6 H14" stroke="#2563eb" strokeWidth="1.2" strokeLinecap="round" />
      <rect x="17.2" y="17.5" width="1.8" height="1.8" fill="#ef4444" />
    </svg>
  );
};

export const Print3DIcon: React.FC<IconProps> = ({ className = 'w-4 h-4' }) => {
  const uid = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 24 24" className={`${className} eqp-icon-3d shrink-0`} aria-hidden="true">
      <defs>
        <linearGradient id={`${uid}-chassis`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#e2e8f0" />
          <stop offset="50%" stopColor="#94a3b8" />
          <stop offset="100%" stopColor="#475569" />
        </linearGradient>
      </defs>
      <rect x="6.5" y="2.8" width="11" height="6" fill="#ffffff" stroke="#334155" strokeWidth="1" />
      <rect x="3" y="8" width="18" height="9" rx="2" fill={`url(#${uid}-chassis)`} stroke="#1e293b" strokeWidth="1.1" />
      <circle cx="17.8" cy="11" r="1.2" fill="#22c55e" stroke="#14532d" strokeWidth="0.5" />
      <rect x="6" y="13.8" width="12" height="7.4" fill="#ffffff" stroke="#334155" strokeWidth="1" />
      <path d="M8 16.5 H16 M8 18.8 H13.5" stroke="#0284c7" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
};

export const Export3DIcon: React.FC<IconProps> = ({ className = 'w-4 h-4' }) => {
  const uid = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 24 24" className={`${className} eqp-icon-3d shrink-0`} aria-hidden="true">
      <defs>
        <linearGradient id={`${uid}-arr`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
        <linearGradient id={`${uid}-tray`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>
      <path d="M12 2.8 V13.5 M7.8 9.8 L12 14.2 L16.2 9.8" fill="none" stroke="#064e3b" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 2.8 V13.5 M7.8 9.8 L12 14.2 L16.2 9.8" fill="none" stroke={`url(#${uid}-arr)`} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 15.5 V19.5 C4 20.3 4.7 21 5.5 21 H18.5 C19.3 21 20 20.3 20 19.5 V15.5" fill="none" stroke={`url(#${uid}-tray)`} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

export const ExportPng3DIcon: React.FC<IconProps> = ({ className = 'w-4 h-4' }) => {
  const uid = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 24 24" className={`${className} eqp-icon-3d shrink-0`} aria-hidden="true">
      <defs>
        <linearGradient id={`${uid}-frame`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="100%" stopColor="#cbd5e1" />
        </linearGradient>
        <linearGradient id={`${uid}-sky`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>
        <linearGradient id={`${uid}-land`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4ade80" />
          <stop offset="100%" stopColor="#15803d" />
        </linearGradient>
        <linearGradient id={`${uid}-dl`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#fde047" />
          <stop offset="100%" stopColor="#ea580c" />
        </linearGradient>
      </defs>
      <rect x="2.5" y="3.5" width="19" height="15.5" rx="2.2" fill={`url(#${uid}-frame)`} stroke="#1e293b" strokeWidth="1.1" />
      <rect x="4.3" y="5.3" width="15.4" height="11.9" rx="1" fill={`url(#${uid}-sky)`} stroke="#0f172a" strokeWidth="0.7" />
      <path d="M4.5 14.5 L8.6 10.6 L12.2 13.8 L15.2 11.4 L19.5 15.2 V17 H4.5 Z" fill={`url(#${uid}-land)`} />
      <circle cx="15.8" cy="8.2" r="1.5" fill="#fef08a" />
      <circle cx="17.5" cy="17.5" r="4.5" fill={`url(#${uid}-dl)`} stroke="#7c2d12" strokeWidth="0.9" />
      <path d="M17.5 15.3 V19.3 M15.6 17.6 L17.5 19.6 L19.4 17.6" fill="none" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

export const ModelSettings3DIcon: React.FC<IconProps> = ({ className = 'w-4 h-4' }) => {
  const uid = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 24 24" className={`${className} eqp-icon-3d shrink-0`} aria-hidden="true">
      <defs>
        <radialGradient id={`${uid}-b`} cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#7dd3fc" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </radialGradient>
        <radialGradient id={`${uid}-a`} cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#fde047" />
          <stop offset="100%" stopColor="#d97706" />
        </radialGradient>
      </defs>
      <path d="M4 7 H20 M4 12 H20 M4 17 H20" stroke="#475569" strokeWidth="2" strokeLinecap="round" />
      <circle cx="9" cy="7" r="2.7" fill={`url(#${uid}-b)`} stroke="#0f172a" strokeWidth="0.9" />
      <circle cx="15.5" cy="12" r="2.7" fill={`url(#${uid}-a)`} stroke="#0f172a" strokeWidth="0.9" />
      <circle cx="10.5" cy="17" r="2.7" fill={`url(#${uid}-b)`} stroke="#0f172a" strokeWidth="0.9" />
    </svg>
  );
};

export const CompareModels3DIcon: React.FC<IconProps> = ({ className = 'w-4 h-4' }) => {
  const uid = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 24 24" className={`${className} eqp-icon-3d shrink-0`} aria-hidden="true">
      <defs>
        <linearGradient id={`${uid}-l1`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7dd3fc" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>
        <linearGradient id={`${uid}-l2`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#c4b5fd" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <polygon points="12,13.5 21,17.5 12,21.5 3,17.5" fill="#10b981" stroke="#064e3b" strokeWidth="0.9" />
      <polygon points="12,8.5 21,12.5 12,16.5 3,12.5" fill={`url(#${uid}-l2)`} stroke="#4c1d95" strokeWidth="0.9" />
      <polygon points="12,3.5 21,7.5 12,11.5 3,7.5" fill={`url(#${uid}-l1)`} stroke="#0c4a6e" strokeWidth="0.9" />
    </svg>
  );
};

export const AiAnalyst3DIcon: React.FC<IconProps> = ({ className = 'w-4 h-4' }) => {
  const uid = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 24 24" className={`${className} eqp-icon-3d shrink-0`} aria-hidden="true">
      <defs>
        <linearGradient id={`${uid}-bub`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="55%" stopColor="#4f46e5" />
          <stop offset="100%" stopColor="#312e81" />
        </linearGradient>
      </defs>
      <path d="M4 5.5 C4 4.1 5.1 3 6.5 3 H17.5 C18.9 3 20 4.1 20 5.5 V14 C20 15.4 18.9 16.5 17.5 16.5 H10.5 L6 20.5 V16.5 H6.5 C5.1 16.5 4 15.4 4 14 Z" fill={`url(#${uid}-bub)`} stroke="#1e1b4b" strokeWidth="1" />
      <path d="M12 5.8 L13.1 8.4 L15.8 9.5 L13.1 10.6 L12 13.2 L10.9 10.6 L8.2 9.5 L10.9 8.4 Z" fill="#fde047" />
    </svg>
  );
};

export const LocateRun3DIcon: React.FC<IconProps> = ({ className = 'w-4 h-4' }) => {
  const uid = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 24 24" className={`${className} eqp-icon-3d shrink-0`} aria-hidden="true">
      <defs>
        <radialGradient id={`${uid}-g`} cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#bef264" />
          <stop offset="55%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#15803d" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="9.5" fill={`url(#${uid}-g)`} stroke="#052e16" strokeWidth="1.1" />
      <polygon points="9.8,7.8 17.2,12 9.8,16.2" fill="#ffffff" stroke="#14532d" strokeWidth="0.7" strokeLinejoin="round" />
    </svg>
  );
};

export const Close3DIcon: React.FC<IconProps> = ({ className = 'w-4 h-4' }) => {
  const uid = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 24 24" className={`${className} eqp-icon-3d shrink-0`} aria-hidden="true">
      <defs>
        <radialGradient id={`${uid}-r`} cx="35%" cy="30%" r="72%">
          <stop offset="0%" stopColor="#fda4af" />
          <stop offset="52%" stopColor="#e11d48" />
          <stop offset="100%" stopColor="#881337" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="9.2" fill={`url(#${uid}-r)`} stroke="#4c0519" strokeWidth="1.1" />
      <ellipse cx="10.2" cy="7.4" rx="4.2" ry="1.8" fill="#ffffff" fillOpacity="0.32" />
      <path d="M8.6 8.6 L15.4 15.4 M15.4 8.6 L8.6 15.4" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
};

/* --- Workstation Icon Style Presets & Duotone Icon System --- */

export type IconStylePreset = 'classic-3d' | 'vibrant-duotone' | 'subtle-hybrid';

export interface IconStyleOptionMeta {
  id: IconStylePreset;
  title: string;
  badge: string;
  description: string;
}

export const ICON_STYLE_OPTIONS: IconStyleOptionMeta[] = [
  {
    id: 'classic-3d',
    title: '3D Glossy Workstation Icons (Classic Modernized)',
    badge: 'Classic 3D Keycaps',
    description:
      'Custom multi-color, gradient-shaded 3D SVG icons on beveled raised keycaps—keeps the classic EQP layout spirit while making it look high-craft and vibrant.',
  },
  {
    id: 'vibrant-duotone',
    title: 'Vibrant Duotone Tactile Cards',
    badge: 'Gradient Tiles + Spring',
    description:
      'Crisp duotone icons seated inside colorful gradient tiles with soft colored shadows and springy motion hover animations.',
  },
  {
    id: 'subtle-hybrid',
    title: 'Subtle Hybrid',
    badge: 'Duotone Menus + 3D Rail',
    description:
      'Keep menus clean with colored duotone icons, and go full 3D animated SVG + tactile keycaps on the Left Action Rail and Action Toolbar.',
  },
];

export type WorkstationActionKey =
  | 'plot'
  | 'locate'
  | 'magnitude'
  | 'bulletin'
  | 'webpage'
  | 'new'
  | 'open'
  | 'save'
  | 'print'
  | 'export'
  | 'export-png'
  | 'model-settings'
  | 'compare-models'
  | 'ai-analyst'
  | 'run-locate'
  | 'pdf'
  | 'close';

export type WorkstationMenuKey =
  | 'new'
  | 'open'
  | 'catalog'
  | 'save'
  | 'save-as'
  | 'export'
  | 'print'
  | 'plot'
  | 'locate'
  | 'magnitude'
  | 'bulletin'
  | 'database'
  | 'ai-analyst'
  | 'settings'
  | 'focal-mechanism'
  | 'historical-seismicity'
  | 'regional-stress'
  | 'strain-analysis'
  | 'coulomb-stress'
  | 'earthquake-sequence'
  | 'reset';

type DuotoneGlyphKind =
  | 'globe'
  | 'crosshair'
  | 'activity'
  | 'file-text'
  | 'webpage'
  | 'new-file'
  | 'open-folder'
  | 'save'
  | 'print'
  | 'export'
  | 'image-export'
  | 'sliders'
  | 'layers'
  | 'ai'
  | 'play'
  | 'book'
  | 'save-as'
  | 'database'
  | 'settings'
  | 'radar'
  | 'compass'
  | 'waves'
  | 'reset'
  | 'close';

interface PaletteSpec {
  tileClass: string;
  strokeClass: string;
}

const ACTION_PALETTE: Record<WorkstationActionKey, PaletteSpec> = {
  plot: { tileClass: 'eqp-tile-sky', strokeClass: 'text-sky-600' },
  locate: { tileClass: 'eqp-tile-rose', strokeClass: 'text-rose-600' },
  magnitude: { tileClass: 'eqp-tile-amber', strokeClass: 'text-amber-600' },
  bulletin: { tileClass: 'eqp-tile-indigo', strokeClass: 'text-indigo-600' },
  webpage: { tileClass: 'eqp-tile-teal', strokeClass: 'text-teal-600' },
  new: { tileClass: 'eqp-tile-emerald', strokeClass: 'text-emerald-600' },
  open: { tileClass: 'eqp-tile-amber', strokeClass: 'text-amber-600' },
  save: { tileClass: 'eqp-tile-sky', strokeClass: 'text-blue-600' },
  print: { tileClass: 'eqp-tile-slate', strokeClass: 'text-slate-700' },
  export: { tileClass: 'eqp-tile-teal', strokeClass: 'text-teal-600' },
  'export-png': { tileClass: 'eqp-tile-sky', strokeClass: 'text-sky-600' },
  'model-settings': { tileClass: 'eqp-tile-violet', strokeClass: 'text-violet-600' },
  'compare-models': { tileClass: 'eqp-tile-indigo', strokeClass: 'text-indigo-600' },
  'ai-analyst': { tileClass: 'eqp-tile-indigo', strokeClass: 'text-indigo-600' },
  'run-locate': { tileClass: 'eqp-tile-emerald', strokeClass: 'text-emerald-600' },
  pdf: { tileClass: 'eqp-tile-rose', strokeClass: 'text-rose-600' },
  close: { tileClass: 'eqp-tile-rose', strokeClass: 'text-rose-600' },
};

const ACTION_TO_GLYPH: Record<WorkstationActionKey, DuotoneGlyphKind> = {
  plot: 'globe',
  locate: 'crosshair',
  magnitude: 'activity',
  bulletin: 'file-text',
  webpage: 'webpage',
  new: 'new-file',
  open: 'open-folder',
  save: 'save',
  print: 'print',
  export: 'export',
  'export-png': 'image-export',
  'model-settings': 'sliders',
  'compare-models': 'layers',
  'ai-analyst': 'ai',
  'run-locate': 'play',
  pdf: 'file-text',
  close: 'close',
};

const MENU_META: Record<WorkstationMenuKey, { glyph: DuotoneGlyphKind; palette: PaletteSpec }> = {
  new: { glyph: 'new-file', palette: { tileClass: 'eqp-tile-emerald', strokeClass: 'text-emerald-600' } },
  open: { glyph: 'open-folder', palette: { tileClass: 'eqp-tile-amber', strokeClass: 'text-amber-600' } },
  catalog: { glyph: 'book', palette: { tileClass: 'eqp-tile-indigo', strokeClass: 'text-indigo-600' } },
  save: { glyph: 'save', palette: { tileClass: 'eqp-tile-sky', strokeClass: 'text-blue-600' } },
  'save-as': { glyph: 'save-as', palette: { tileClass: 'eqp-tile-teal', strokeClass: 'text-teal-600' } },
  export: { glyph: 'export', palette: { tileClass: 'eqp-tile-emerald', strokeClass: 'text-emerald-600' } },
  print: { glyph: 'print', palette: { tileClass: 'eqp-tile-slate', strokeClass: 'text-slate-600' } },
  plot: { glyph: 'globe', palette: { tileClass: 'eqp-tile-sky', strokeClass: 'text-sky-600' } },
  locate: { glyph: 'crosshair', palette: { tileClass: 'eqp-tile-rose', strokeClass: 'text-rose-600' } },
  magnitude: { glyph: 'activity', palette: { tileClass: 'eqp-tile-amber', strokeClass: 'text-amber-600' } },
  bulletin: { glyph: 'file-text', palette: { tileClass: 'eqp-tile-indigo', strokeClass: 'text-indigo-600' } },
  database: { glyph: 'database', palette: { tileClass: 'eqp-tile-teal', strokeClass: 'text-teal-600' } },
  'ai-analyst': { glyph: 'ai', palette: { tileClass: 'eqp-tile-violet', strokeClass: 'text-violet-600' } },
  settings: { glyph: 'settings', palette: { tileClass: 'eqp-tile-slate', strokeClass: 'text-slate-600' } },
  'focal-mechanism': { glyph: 'radar', palette: { tileClass: 'eqp-tile-rose', strokeClass: 'text-rose-600' } },
  'historical-seismicity': { glyph: 'globe', palette: { tileClass: 'eqp-tile-sky', strokeClass: 'text-sky-600' } },
  'regional-stress': { glyph: 'compass', palette: { tileClass: 'eqp-tile-amber', strokeClass: 'text-amber-600' } },
  'strain-analysis': { glyph: 'activity', palette: { tileClass: 'eqp-tile-emerald', strokeClass: 'text-emerald-600' } },
  'coulomb-stress': { glyph: 'layers', palette: { tileClass: 'eqp-tile-violet', strokeClass: 'text-violet-600' } },
  'earthquake-sequence': { glyph: 'waves', palette: { tileClass: 'eqp-tile-teal', strokeClass: 'text-teal-600' } },
  reset: { glyph: 'reset', palette: { tileClass: 'eqp-tile-slate', strokeClass: 'text-slate-600' } },
};

const DuotoneGlyph: React.FC<{
  kind: DuotoneGlyphKind;
  className?: string;
  monochrome?: boolean;
  locating?: boolean;
}> = ({ kind, className = 'w-4 h-4', monochrome = false, locating = false }) => {
  const fillOpacity = monochrome ? '0' : '0.26';
  const strokeWidth = monochrome ? 1.8 : 1.95;

  switch (kind) {
    case 'globe':
      return (
        <svg viewBox="0 0 24 24" className={`${className} ${locating ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" fill="currentColor" fillOpacity={fillOpacity} />
          <ellipse cx="12" cy="12" rx="4" ry="9" />
          <path d="M3.5 12h17" />
        </svg>
      );
    case 'crosshair':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="7.5" fill="currentColor" fillOpacity={fillOpacity} />
          <path d="M12 2.5v3.5M12 18v3.5M2.5 12H6M18 12h3.5" />
          <circle cx="12" cy="12" r="2.2" fill="currentColor" />
        </svg>
      );
    case 'activity':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4.5" width="18" height="15" rx="3" fill="currentColor" fillOpacity={fillOpacity} />
          <path d="M5.5 12h2.8l1.9-4.5 3.3 9 2-4.5h3" />
        </svg>
      );
    case 'file-text':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 3h8l4 4v14H6z" fill="currentColor" fillOpacity={fillOpacity} />
          <path d="M14 3v4h4M9 12h6M9 16h4" />
        </svg>
      );
    case 'webpage':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="2.5" fill="currentColor" fillOpacity={fillOpacity} />
          <path d="M3 9h18" />
          <circle cx="12" cy="14.5" r="3" />
        </svg>
      );
    case 'new-file':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 3h8l4 4v14H6z" fill="currentColor" fillOpacity={fillOpacity} />
          <path d="M14 3v4h4M12 11.5v5M9.5 14h5" />
        </svg>
      );
    case 'open-folder':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 6.5a2 2 0 0 1 2-2h4.2l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="currentColor" fillOpacity={fillOpacity} />
          <path d="M3 10h18" />
        </svg>
      );
    case 'save':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 4h13l3 3v13H4z" fill="currentColor" fillOpacity={fillOpacity} />
          <path d="M8 4v5h7V4M7.5 20v-6h9v6" />
        </svg>
      );
    case 'save-as':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="currentColor" fillOpacity={fillOpacity} />
          <path d="M12 10.5v5M9.5 13h5" />
        </svg>
      );
    case 'print':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9V4h12v5" />
          <rect x="3" y="9" width="18" height="8" rx="2" fill="currentColor" fillOpacity={fillOpacity} />
          <path d="M7 14h10v6H7z" fill="currentColor" fillOpacity={monochrome ? '0' : '0.18'} />
        </svg>
      );
    case 'export':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="4" y="14" width="16" height="6" rx="1.5" fill="currentColor" fillOpacity={fillOpacity} />
          <path d="M12 3.5v10M8.5 10l3.5 3.8L15.5 10" />
        </svg>
      );
    case 'image-export':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="2.5" fill="currentColor" fillOpacity={fillOpacity} />
          <circle cx="8.5" cy="9.5" r="1.5" fill="currentColor" />
          <path d="M21 15l-4.5-4.5L7 20" />
        </svg>
      );
    case 'sliders':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
          <circle cx="9" cy="7" r="2.2" fill="currentColor" fillOpacity={monochrome ? '0' : '0.55'} />
          <circle cx="15" cy="12" r="2.2" fill="currentColor" fillOpacity={monochrome ? '0' : '0.55'} />
          <circle cx="10.5" cy="17" r="2.2" fill="currentColor" fillOpacity={monochrome ? '0' : '0.55'} />
        </svg>
      );
    case 'layers':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="12,3.5 21,8 12,12.5 3,8" fill="currentColor" fillOpacity={fillOpacity} />
          <path d="M3 12.5 12 17l9-4.5M3 16.8 12 21l9-4.2" />
        </svg>
      );
    case 'ai':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 6a2.5 2.5 0 0 1 2.5-2.5h11A2.5 2.5 0 0 1 20 6v8.5A2.5 2.5 0 0 1 17.5 17H10l-4.5 3.5V17H6.5A2.5 2.5 0 0 1 4 14.5z" fill="currentColor" fillOpacity={fillOpacity} />
          <path d="M12 7l.9 2.1L15 10l-2.1.9L12 13l-.9-2.1L9 10l2.1-.9z" fill="currentColor" />
        </svg>
      );
    case 'play':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" fill="currentColor" fillOpacity={fillOpacity} />
          <polygon points="10,8.2 16.5,12 10,15.8" fill="currentColor" />
        </svg>
      );
    case 'book':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H12v17H6.5A2.5 2.5 0 0 0 4 22z" fill="currentColor" fillOpacity={fillOpacity} />
          <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H12v17h5.5a2.5 2.5 0 0 1 2.5 2z" fill="currentColor" fillOpacity={fillOpacity} />
        </svg>
      );
    case 'database':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <ellipse cx="12" cy="6" rx="7.5" ry="3" fill="currentColor" fillOpacity={fillOpacity} />
          <path d="M4.5 6v12c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3V6" fill="currentColor" fillOpacity={monochrome ? '0' : '0.14'} />
          <path d="M4.5 12c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3" />
        </svg>
      );
    case 'settings':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="7" fill="currentColor" fillOpacity={fillOpacity} strokeDasharray="3 2.2" />
          <circle cx="12" cy="12" r="2.8" fill="currentColor" fillOpacity={monochrome ? '0' : '0.5'} />
        </svg>
      );
    case 'radar':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" fill="currentColor" fillOpacity={fillOpacity} />
          <circle cx="12" cy="12" r="4" />
          <path d="M12 12l5.2-5.2" />
        </svg>
      );
    case 'compass':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" fill="currentColor" fillOpacity={fillOpacity} />
          <polygon points="15.5,8.5 13.4,13.4 8.5,15.5 10.6,10.6" fill="currentColor" fillOpacity={monochrome ? '0' : '0.65'} />
        </svg>
      );
    case 'waves':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="3" fill="currentColor" fillOpacity={fillOpacity} />
          <path d="M5.5 10c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0 3-1.5 4 0M5.5 14.5c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0 3-1.5 4 0" />
        </svg>
      );
    case 'reset':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="8" fill="currentColor" fillOpacity={fillOpacity} stroke="none" />
          <path d="M4 12a8 8 0 1 0 2.3-5.6L4 8.7M4 4.5v4.2h4.2" />
        </svg>
      );
    case 'close':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" fill="currentColor" fillOpacity={fillOpacity} />
          <path d="M9 9l6 6M15 9l-6 6" />
        </svg>
      );
  }
};

export const WorkstationActionIcon: React.FC<{
  preset: IconStylePreset;
  action: WorkstationActionKey;
  size: 'rail' | 'toolbar' | 'toolbar-lg' | 'footer';
  locating?: boolean;
}> = ({ preset, action, size, locating = false }) => {
  if (preset === 'vibrant-duotone') {
    const palette = ACTION_PALETTE[action];
    const glyph = ACTION_TO_GLYPH[action];
    const tileDims =
      size === 'rail'
        ? 'w-9 h-9 rounded-xl'
        : size === 'toolbar-lg'
          ? 'w-8 h-8 rounded-lg'
          : size === 'footer'
            ? 'w-5 h-5 rounded-md'
            : 'w-[22px] h-[22px] rounded-md';
    const glyphDims =
      size === 'rail' || size === 'toolbar-lg'
        ? 'w-5 h-5'
        : size === 'footer'
          ? 'w-3 h-3'
          : 'w-3.5 h-3.5';

    return (
      <span
        className={`eqp-duotone-tile ${palette.tileClass} ${tileDims} inline-flex items-center justify-center text-white shrink-0`}
      >
        <DuotoneGlyph kind={glyph} className={glyphDims} locating={locating} />
      </span>
    );
  }

  const iconClass =
    size === 'rail'
      ? 'w-8 h-8'
      : size === 'toolbar-lg'
        ? 'w-7 h-7'
        : size === 'footer'
          ? 'w-4 h-4'
          : 'w-[18px] h-[18px]';

  switch (action) {
    case 'plot':
      return <PlotGlobe3DIcon className={iconClass} locating={locating} />;
    case 'locate':
      return <LocateCrosshair3DIcon className={iconClass} />;
    case 'magnitude':
      return <MagnitudeSeismic3DIcon className={iconClass} />;
    case 'bulletin':
    case 'pdf':
      return <BulletinDoc3DIcon className={iconClass} />;
    case 'webpage':
      return <WebPageGlobe3DIcon className={iconClass} />;
    case 'new':
      return <NewFile3DIcon className={iconClass} />;
    case 'open':
      return <OpenFolder3DIcon className={iconClass} />;
    case 'save':
      return <SaveDisk3DIcon className={iconClass} />;
    case 'print':
      return <Print3DIcon className={iconClass} />;
    case 'export':
      return <Export3DIcon className={iconClass} />;
    case 'export-png':
      return <ExportPng3DIcon className={iconClass} />;
    case 'model-settings':
      return <ModelSettings3DIcon className={iconClass} />;
    case 'compare-models':
      return <CompareModels3DIcon className={iconClass} />;
    case 'ai-analyst':
      return <AiAnalyst3DIcon className={iconClass} />;
    case 'run-locate':
      return <LocateRun3DIcon className={iconClass} />;
    case 'close':
      return <Close3DIcon className={iconClass} />;
  }
};

export const WorkstationMenuIcon: React.FC<{
  preset: IconStylePreset;
  action: WorkstationMenuKey;
}> = ({ preset, action }) => {
  const { glyph, palette } = MENU_META[action];

  if (preset === 'vibrant-duotone') {
    return (
      <span
        className={`eqp-duotone-tile ${palette.tileClass} w-[18px] h-[18px] rounded inline-flex items-center justify-center text-white shrink-0`}
      >
        <DuotoneGlyph kind={glyph} className="w-3 h-3" />
      </span>
    );
  }

  if (preset === 'subtle-hybrid') {
    return (
      <DuotoneGlyph
        kind={glyph}
        className={`w-4 h-4 shrink-0 ${palette.strokeClass} group-hover:text-white`}
      />
    );
  }

  return <DuotoneGlyph kind={glyph} className="w-3.5 h-3.5 shrink-0" monochrome />;
};

/* --- Button Surface & Layout Style Presets --- */

export type ButtonStylePreset =
  | 'classic-keycap'
  | 'accent-stripe'
  | 'pastel-satin'
  | 'vibrant-glossy';

export interface ButtonStyleOptionMeta {
  id: ButtonStylePreset;
  title: string;
  badge: string;
  description: string;
}

export const BUTTON_STYLE_OPTIONS: ButtonStyleOptionMeta[] = [
  {
    id: 'classic-keycap',
    title: 'Classic Beveled Keycaps',
    badge: 'Neutral Pearl',
    description:
      'Clean pearl-slate 3D beveled keycaps with crisp borders and mechanical press travel. Keeps the traditional EQP workstation contrast.',
  },
  {
    id: 'accent-stripe',
    title: 'Pearl Keycaps + Colored Accent Strip',
    badge: '3px Top Stripe',
    description:
      'Light keycap faces topped with a 3px color-coded accent bar by action role and a subtle colored hover bloom.',
  },
  {
    id: 'pastel-satin',
    title: 'Pastel Satin Colored Pills',
    badge: 'Soft Tinted + Spring',
    description:
      'Soft role-colored satin gradient button surfaces with rounded pill-card corners, matching borders, and springy hover lift.',
  },
  {
    id: 'vibrant-glossy',
    title: 'Vibrant Glossy Gradient + Sheen Sweep',
    badge: 'Jewel + Glass Sheen',
    description:
      'Rich multi-stop colored gradient buttons with white text, 3D colored bevels, diagonal glass sheen sweep on hover, and unsaved pulse.',
  },
];

export type WorkstationButtonTone =
  | 'sky'
  | 'rose'
  | 'amber'
  | 'indigo'
  | 'teal'
  | 'emerald'
  | 'violet'
  | 'slate'
  | 'primary';

export const ACTION_TONE: Record<WorkstationActionKey, WorkstationButtonTone> = {
  plot: 'sky',
  locate: 'rose',
  magnitude: 'amber',
  bulletin: 'indigo',
  webpage: 'teal',
  new: 'emerald',
  open: 'amber',
  save: 'sky',
  print: 'slate',
  export: 'teal',
  'export-png': 'sky',
  'model-settings': 'violet',
  'compare-models': 'indigo',
  'ai-analyst': 'violet',
  'run-locate': 'primary',
  pdf: 'rose',
  close: 'rose',
};

export function getWorkstationButtonClass(opts: {
  buttonStyle: ButtonStylePreset;
  iconStyle: IconStylePreset;
  action: WorkstationActionKey;
  surface: 'rail' | 'toolbar' | 'footer';
  active?: boolean;
  locating?: boolean;
  edited?: boolean;
  pulseWhenEdited?: boolean;
}): string {
  const {
    buttonStyle,
    iconStyle,
    action,
    surface,
    active = false,
    locating = false,
    edited = false,
    pulseWhenEdited = false,
  } = opts;

  const hybridClass = iconStyle === 'subtle-hybrid' ? 'eqp-hybrid-surface' : '';
  const baseTone = ACTION_TONE[action];
  const resolvedTone: WorkstationButtonTone = locating || edited ? 'amber' : baseTone;

  if (buttonStyle === 'classic-keycap') {
    if (surface === 'rail') {
      if (iconStyle === 'vibrant-duotone') {
        const stateCls = locating
          ? 'eqp-tactile-rail-card-locating cursor-wait opacity-95'
          : active
            ? 'eqp-tactile-rail-card-active ring-1 ring-blue-500 cursor-pointer'
            : 'eqp-tactile-rail-card cursor-pointer';
        return `rounded-xl ${stateCls}`;
      }
      const stateCls = locating
        ? 'eqp-keycap-rail-locating cursor-wait opacity-95'
        : active
          ? 'eqp-keycap-rail-active ring-1 ring-blue-600 cursor-pointer'
          : 'eqp-keycap-rail cursor-pointer';
      return `rounded-sm ${hybridClass} ${stateCls}`;
    }

    const radius = iconStyle === 'vibrant-duotone' ? 'rounded-md' : 'rounded-sm';
    const baseBtn =
      iconStyle === 'vibrant-duotone'
        ? active || resolvedTone === 'primary'
          ? 'eqp-tactile-btn-primary'
          : edited
            ? 'eqp-tactile-btn-warn'
            : 'eqp-tactile-btn'
        : active || resolvedTone === 'primary'
          ? 'eqp-keycap-btn-primary'
          : edited
            ? 'eqp-keycap-btn-warn'
            : 'eqp-keycap-btn';
    return `${radius} ${hybridClass} ${baseBtn} cursor-pointer`;
  }

  if (buttonStyle === 'accent-stripe') {
    const radius = surface === 'rail' ? 'rounded-sm' : 'rounded-sm';
    const stateCls =
      active || resolvedTone === 'primary' || locating || edited
        ? 'eqp-btn-accent-active'
        : '';
    return `${radius} ${hybridClass} eqp-tone-${resolvedTone} eqp-btn-accent ${stateCls} ${
      locating ? 'cursor-wait opacity-95' : 'cursor-pointer'
    }`;
  }

  if (buttonStyle === 'pastel-satin') {
    const radius =
      surface === 'rail' ? 'rounded-xl' : surface === 'footer' ? 'rounded-lg' : 'rounded-lg';
    const stateCls = active ? 'eqp-btn-pastel-active' : '';
    return `${radius} ${hybridClass} eqp-tone-${resolvedTone} eqp-btn-pastel ${stateCls} ${
      locating ? 'cursor-wait opacity-95' : 'cursor-pointer'
    }`;
  }

  // vibrant-glossy
  const radius =
    surface === 'rail' ? 'rounded-lg' : surface === 'footer' ? 'rounded-md' : 'rounded-md';
  const stateCls = active ? 'eqp-btn-glossy-active' : '';
  const pulseCls = pulseWhenEdited && edited ? 'eqp-btn-unsaved-pulse' : '';
  return `${radius} ${hybridClass} eqp-tone-${resolvedTone} eqp-btn-glossy ${stateCls} ${pulseCls} ${
    locating ? 'cursor-wait opacity-95' : 'cursor-pointer'
  }`;
}


