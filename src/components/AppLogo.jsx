import React from 'react';
import { Link, useLocation } from 'react-router-dom';

/**
 * The BrainSTEM Pilot mark.
 *
 * Deliberately the same file the browser tab and the desktop app icon use, so the three can
 * never drift apart — replace public/favicon.png and all of them follow. BASE_URL keeps it
 * resolvable under both the GitHub Pages subpath and the desktop build's relative base.
 */
const LOGO_SRC = `${import.meta.env.BASE_URL}favicon.png`;

export default function AppLogo({ className = 'w-7 h-7' }) {
  return (
    <img
      src={LOGO_SRC}
      alt="BrainSTEM Pilot"
      draggable="false"
      className={`${className} shrink-0 rounded-md select-none`}
    />
  );
}

/**
 * The mark pinned to the top-left corner, on every screen but the home screen — which shows
 * it full size in its own hero. Fixed to the viewport rather than dropped into each page's
 * header, because those headers disagree: some are full-width bars, others sit inside a
 * centred max-width column, so the same markup would land in a different place on each page.
 * Every page leaves room for it (see the left padding on their header rows).
 */
export function HomeLogoLink() {
  const { pathname } = useLocation();
  if (pathname === '/' || pathname === '/home') return null;
  return (
    <Link
      to="/home"
      title="Home"
      aria-label="Home"
      className="fixed top-2.5 left-3 z-50 rounded-md opacity-90 hover:opacity-100 hover:scale-105 transition-all"
    >
      <AppLogo className="w-7 h-7" />
    </Link>
  );
}
