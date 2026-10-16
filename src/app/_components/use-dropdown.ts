// src/app/_components/use-dropdown.ts
//
// Open/close behaviour shared by the navbar's flyouts (Filter, My Trade, notifications, account):
//   - mouse: opens on hover, closes when the pointer leaves (the original desktop behaviour);
//   - touch / pen / keyboard: the trigger button toggles it — hover never fires on a phone;
//   - a tap or click outside, or Escape, closes it.
// Hover is tracked so that a mouse click on an already hover-opened trigger doesn't immediately close it again.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useDropdown(onOpen?: () => void) {
  const [open, setOpenState] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const hovering = useRef(false);
  const onOpenRef = useRef(onOpen);
  useEffect(() => {
    onOpenRef.current = onOpen;
  });

  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    if (next) onOpenRef.current?.();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpenState(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenState(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const containerProps = {
    ref: containerRef,
    onPointerEnter: (e: React.PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      hovering.current = true;
      setOpen(true);
    },
    onPointerLeave: (e: React.PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      hovering.current = false;
      setOpenState(false);
    },
  };

  const buttonProps = {
    "aria-expanded": open,
    "aria-haspopup": true as const,
    onClick: () => (hovering.current ? setOpen(true) : setOpen(!open)),
  };

  return { open, setOpen, containerProps, buttonProps };
}
