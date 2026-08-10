"use client";

import { useRef } from "react";

// How long a finger has to stay put. 500ms is the platform's own threshold for
// a long press; shorter and a slow tap opens the sheet by accident.
const MS = 500;
// A finger is never perfectly still. Under this much drift it is still a press;
// over it, the user is scrolling the grid and must not be interrupted.
const TOLERANCIA_PX = 10;

/**
 * Long press on touch, right-click on a mouse.
 *
 * The product card is a button that adds to the cart, so the press has to
 * cancel the tap that follows it — otherwise holding a product to read it also
 * puts it in the sale. `abrio` records that we fired, and the card's onClick
 * checks it.
 *
 * Returns handlers to spread onto the element.
 */
export function useLongPress(onLongPress: () => void) {
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inicio = useRef<{ x: number; y: number } | null>(null);
  const abrio = useRef(false);

  const cancelar = () => {
    if (t.current) clearTimeout(t.current);
    t.current = null;
    inicio.current = null;
  };

  return {
    /** True when the press already fired, so the click after it is not a tap. */
    consumioElTap: () => {
      const v = abrio.current;
      abrio.current = false;
      return v;
    },
    handlers: {
      onTouchStart: (e: React.TouchEvent) => {
        const tk = e.touches[0];
        inicio.current = { x: tk.clientX, y: tk.clientY };
        abrio.current = false;
        t.current = setTimeout(() => {
          abrio.current = true;
          // The phone confirms the gesture landed; without it a long press
          // feels like the app froze.
          navigator.vibrate?.(15);
          onLongPress();
        }, MS);
      },
      onTouchMove: (e: React.TouchEvent) => {
        if (!inicio.current) return;
        const tk = e.touches[0];
        const dx = Math.abs(tk.clientX - inicio.current.x);
        const dy = Math.abs(tk.clientY - inicio.current.y);
        if (dx > TOLERANCIA_PX || dy > TOLERANCIA_PX) cancelar();
      },
      onTouchEnd: cancelar,
      onTouchCancel: cancelar,
      // A mouse has no long press; right-click is the same intent.
      onContextMenu: (e: React.MouseEvent) => {
        e.preventDefault();
        onLongPress();
      },
    },
  };
}
