import { useEffect, RefObject } from "react";

/**
 * Hook that enables horizontal scrolling when Ctrl/Cmd + mouse wheel is used
 * @param ref - Reference to the scrollable element
 * @param enabled - Whether the hook is enabled (default: true)
 */
export function useHorizontalScroll(
  ref: RefObject<HTMLElement>,
  enabled: boolean = true
) {
  useEffect(() => {
    if (!enabled) return;
    
    const element = ref.current;
    if (!element) return;

    const handleWheel = (e: WheelEvent) => {
      // Check if Ctrl (Windows/Linux) or Cmd (Mac) is pressed
      if (e.ctrlKey || e.metaKey) {
        // Prevent default vertical scroll
        e.preventDefault();
        
        // Apply horizontal scroll
        element.scrollLeft += e.deltaY;
      }
    };

    element.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      element.removeEventListener("wheel", handleWheel);
    };
  }, [ref, enabled]);
}
