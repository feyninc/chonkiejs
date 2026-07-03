"use client";

import { useEffect, useState } from "react";

/** Avoids fumadocs MetaOrControl SSR/client mismatch (⌘ vs Ctrl). */
export function SearchHotKeyLabel() {
  const [label, setLabel] = useState("\u00A0");

  useEffect(() => {
    setLabel(/Windows|Linux/i.test(navigator.userAgent) ? "Ctrl" : "⌘");
  }, []);

  return <span suppressHydrationWarning>{label}</span>;
}
