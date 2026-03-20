import { useCallback, useRef, RefObject } from "react";

const EDGE_ZONE = 80; // px from edge to trigger scroll
const SCROLL_SPEED = 12; // px per frame

/**
 * Hook that auto-scrolls a horizontally scrollable container
 * when a dragged element approaches the left or right edges.
 */
export function useKanbanAutoScroll(scrollRef: RefObject<HTMLElement>) {
  const rafId = useRef<number | null>(null);

  const stopAutoScroll = useCallback(() => {
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
  }, []);

  const handleDragOverWithScroll = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();

      const container = scrollRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const x = e.clientX;

      const distFromLeft = x - rect.left;
      const distFromRight = rect.right - x;

      stopAutoScroll();

      if (distFromLeft < EDGE_ZONE) {
        // Scroll left — speed increases as cursor gets closer to edge
        const intensity = 1 - distFromLeft / EDGE_ZONE;
        const step = () => {
          container.scrollLeft -= SCROLL_SPEED * intensity;
          rafId.current = requestAnimationFrame(step);
        };
        rafId.current = requestAnimationFrame(step);
      } else if (distFromRight < EDGE_ZONE) {
        // Scroll right
        const intensity = 1 - distFromRight / EDGE_ZONE;
        const step = () => {
          container.scrollLeft += SCROLL_SPEED * intensity;
          rafId.current = requestAnimationFrame(step);
        };
        rafId.current = requestAnimationFrame(step);
      }
    },
    [scrollRef, stopAutoScroll]
  );

  return { handleDragOverWithScroll, stopAutoScroll };
}
