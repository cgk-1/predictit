import { useEffect, useState, type RefObject } from "react";

/** Measured width of an element (for pixel-accurate SVG charts). Falls back to `fallback` before layout. */
export function useWidth(ref: RefObject<HTMLElement | null>, fallback = 640): number {
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setW(Math.max(200, Math.floor(el.getBoundingClientRect().width)));
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}
