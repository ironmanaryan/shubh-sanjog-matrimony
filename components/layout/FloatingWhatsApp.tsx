'use client';

import { useEffect, useRef, useState } from 'react';
import WhatsAppIcon from '@/components/ui/whatsapp-icon';
import { WHATSAPP_NUMBER } from '@/lib/whatsapp';

// Direct action link (per spec) — opens a chat with the bureau.
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}`;

// Geometry constants — keep BUTTON_SIZE in sync with the h-14 w-14 classes.
const BUTTON_SIZE = 56;
const EDGE_MARGIN = 24; // matches the bottom-6 right-6 resting corner
const DRAG_THRESHOLD_PX = 6; // distinguishes a tap/click from a drag

type Point = { x: number; y: number };

/** Keep the widget fully on-screen at any viewport size. */
function clampToViewport(p: Point): Point {
  const maxX = Math.max(0, window.innerWidth - BUTTON_SIZE);
  const maxY = Math.max(0, window.innerHeight - BUTTON_SIZE);
  return { x: Math.min(Math.max(0, p.x), maxX), y: Math.min(Math.max(0, p.y), maxY) };
}

/**
 * Floating WhatsApp widget — pure round brand icon, fixed site-wide, and
 * DRAGGABLE anywhere on screen (pointer events cover mouse + touch).
 *
 * Tap vs. drag: movement under DRAG_THRESHOLD_PX counts as a click and lets
 * the link open; anything more repositions the widget and suppresses the
 * navigation that would otherwise fire on pointerup.
 */
export default function FloatingWhatsApp() {
  // null → rest at the default bottom-right corner until the first drag.
  const [pos, setPos] = useState<Point | null>(null);
  const drag = useRef<{ pointerId: number; origin: Point; start: Point; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  // Position is only computed client-side (post-hydration), so SSR output
  // keeps the static bottom-right classes and never mismatches.
  // Defer DOM reads (window.innerWidth/innerHeight) to next frame to avoid
  // forced synchronous layout reflow during initial hydration (Lighthouse Best Practices).
  useEffect(() => {
    let raf = 0;
    let resizeRaf = 0;
    const schedulePos = () => {
      raf = requestAnimationFrame(() => {
        setPos(
          clampToViewport({
            x: window.innerWidth - BUTTON_SIZE - EDGE_MARGIN,
            y: window.innerHeight - BUTTON_SIZE - EDGE_MARGIN,
          })
        );
      });
    };
    schedulePos();
    // Re-clamp if the window shrinks after the widget was dragged somewhere.
    // Debounce with rAF to avoid layout thrash on resize.
    const onResize = () => {
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => setPos((p) => (p ? clampToViewport(p) : p)));
    };
    window.addEventListener('resize', onResize, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(resizeRaf);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLAnchorElement>) => {
    if (!pos || !e.isPrimary) return;
    // Capture the pointer so moves keep streaming in even outside the button.
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      pointerId: e.pointerId,
      origin: pos,
      start: { x: e.clientX, y: e.clientY },
      moved: false,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLAnchorElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.start.x;
    const dy = e.clientY - d.start.y;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    d.moved = true;
    setPos(clampToViewport({ x: d.origin.x + dx, y: d.origin.y + dy }));
  };

  const endDrag = () => {
    const d = drag.current;
    drag.current = null;
    // A real drag suppresses the click event that follows pointerup.
    suppressClick.current = Boolean(d?.moved);
  };

  const onClick = (e: React.MouseEvent) => {
    if (suppressClick.current) {
      e.preventDefault();
      suppressClick.current = false;
    }
  };

  return (
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      title="Chat with us on WhatsApp"
      draggable={false}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClick={onClick}
      style={pos ? { left: pos.x, top: pos.y } : undefined}
      className={`fixed z-50 inline-flex h-14 w-14 cursor-grab touch-none select-none items-center justify-center rounded-full bg-[#25D366] text-white shadow-xl shadow-[#25D366]/30 transition-colors duration-200 hover:bg-[#1fbf5b] active:cursor-grabbing ${
        pos ? '' : 'bottom-6 right-6'
      }`}
    >
      <WhatsAppIcon className="h-7 w-7 shrink-0" />
    </a>
  );
}
