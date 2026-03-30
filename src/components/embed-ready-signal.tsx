"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function EmbedReadySignal() {
  const pathname = usePathname();

  useEffect(() => {
    if (window.parent === window) {
      return;
    }

    const announceReady = () => {
      window.parent.postMessage(
        {
          type: "portfolio-demo-ready",
          path: pathname,
        },
        "*",
      );
    };

    const animationFrameId = window.requestAnimationFrame(announceReady);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [pathname]);

  return null;
}
