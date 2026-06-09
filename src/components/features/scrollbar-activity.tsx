"use client";

import { useEffect } from "react";

const SCROLL_ACTIVE_TIMEOUT_MS = 850;

export function ScrollbarActivity() {
  useEffect(() => {
    const activeTimers = new Map<Element, number>();
    let rootTimer: number | null = null;

    function markRootActive() {
      document.documentElement.dataset.scrollActive = "true";

      if (rootTimer !== null) {
        window.clearTimeout(rootTimer);
      }

      rootTimer = window.setTimeout(() => {
        delete document.documentElement.dataset.scrollActive;
        rootTimer = null;
      }, SCROLL_ACTIVE_TIMEOUT_MS);
    }

    function markElementActive(element: Element) {
      element.setAttribute("data-scroll-active", "true");

      const previousTimer = activeTimers.get(element);

      if (previousTimer) {
        window.clearTimeout(previousTimer);
      }

      const nextTimer = window.setTimeout(() => {
        element.removeAttribute("data-scroll-active");
        activeTimers.delete(element);
      }, SCROLL_ACTIVE_TIMEOUT_MS);

      activeTimers.set(element, nextTimer);
    }

    function handleScroll(event: Event) {
      markRootActive();

      const target = event.target;

      if (target instanceof Element) {
        markElementActive(target);
      }
    }

    window.addEventListener("scroll", handleScroll, true);

    return () => {
      window.removeEventListener("scroll", handleScroll, true);

      if (rootTimer !== null) {
        window.clearTimeout(rootTimer);
      }

      for (const [element, timer] of activeTimers) {
        window.clearTimeout(timer);
        element.removeAttribute("data-scroll-active");
      }

      delete document.documentElement.dataset.scrollActive;
    };
  }, []);

  return null;
}
