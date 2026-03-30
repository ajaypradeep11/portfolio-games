"use client";

import { useEffect, type MouseEvent, type MutableRefObject, type PointerEvent } from "react";
import styles from "@/app/page.module.css";

type DirectionCode = "ArrowUp" | "ArrowLeft" | "ArrowRight" | "ArrowDown";

const directionButtons: Array<{ code: DirectionCode; label: string; className: string; ariaLabel: string }> = [
  { code: "ArrowUp", label: "^", className: "inputPadUp", ariaLabel: "Aim up" },
  { code: "ArrowLeft", label: "<", className: "inputPadLeft", ariaLabel: "Aim left" },
  { code: "ArrowRight", label: ">", className: "inputPadRight", ariaLabel: "Aim right" },
  { code: "ArrowDown", label: "v", className: "inputPadDown", ariaLabel: "Aim down" },
];

function stopEvent(event: MouseEvent<HTMLButtonElement> | PointerEvent<HTMLButtonElement>) {
  event.preventDefault();
  event.stopPropagation();
}

export default function GameInputPad({
  keysRef,
  onShoot,
}: {
  keysRef: MutableRefObject<Record<string, boolean>>;
  onShoot: () => void;
}) {
  useEffect(() => {
    const keyState = keysRef.current;

    return () => {
      for (const { code } of directionButtons) {
        keyState[code] = false;
      }
    };
  }, [keysRef]);

  const setDirection = (code: DirectionCode, pressed: boolean) => {
    keysRef.current[code] = pressed;
  };

  const handleDirectionPress = (code: DirectionCode) => (event: PointerEvent<HTMLButtonElement>) => {
    stopEvent(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    setDirection(code, true);
  };

  const handleDirectionRelease = (code: DirectionCode) => (event: PointerEvent<HTMLButtonElement>) => {
    stopEvent(event);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setDirection(code, false);
  };

  const handleShoot = (event: MouseEvent<HTMLButtonElement>) => {
    stopEvent(event);
    onShoot();
  };

  return (
    <div className={styles.inputPadDock} aria-label="On-screen controls">
      <div className={styles.inputPadGrid}>
        {directionButtons.map(({ code, label, className, ariaLabel }) => (
          <button
            key={code}
            aria-label={ariaLabel}
            className={`${styles.inputPadButton} ${styles[className]}`}
            type="button"
            onContextMenu={stopEvent}
            onPointerCancel={handleDirectionRelease(code)}
            onPointerDown={handleDirectionPress(code)}
            onPointerUp={handleDirectionRelease(code)}
          >
            {label}
          </button>
        ))}

        <button
          aria-label="Shoot"
          className={`${styles.inputPadButton} ${styles.inputPadShoot}`}
          type="button"
          onClick={handleShoot}
          onContextMenu={stopEvent}
        >
          Shoot
        </button>
      </div>
    </div>
  );
}
