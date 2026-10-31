import { useEffect, type RefObject } from 'react';

/** Convierte la rueda vertical en scroll horizontal al estar encima del contenedor. */
export function useHorizontalWheelScroll(
  ...refs: Array<RefObject<HTMLElement | null>>
) {
  useEffect(() => {
    const cleanups: Array<() => void> = [];

    for (const ref of refs) {
      const node = ref.current;
      if (!node) continue;

      const onWheel = (event: WheelEvent) => {
        if (node.scrollWidth <= node.clientWidth + 1) return;

        const delta =
          Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
        if (!delta) return;

        const max = node.scrollWidth - node.clientWidth;
        const next = Math.min(max, Math.max(0, node.scrollLeft + delta));
        if (next === node.scrollLeft) return;

        event.preventDefault();
        node.scrollLeft = next;
      };

      node.addEventListener('wheel', onWheel, { passive: false });
      cleanups.push(() => node.removeEventListener('wheel', onWheel));
    }

    return () => {
      for (const cleanup of cleanups) cleanup();
    };
    // Ref objects are stable; .current is ready after mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
