"use client";

import { RootProvider } from "fumadocs-ui/provider/next";
import type { ReactNode } from "react";
import { ChonkieSearchDialog } from "@/components/search-dialog";
import { SearchHotKeyLabel } from "@/components/search-hotkey-label";

export function ChonkieJsRootProvider({ children }: { children: ReactNode }) {
  return (
    <RootProvider
      theme={{
        enableSystem: false,
        defaultTheme: "light",
      }}
      search={{
        SearchDialog: ChonkieSearchDialog,
        options: { type: "static" },
        hotKey: [
          {
            key: (event) => event.metaKey || event.ctrlKey,
            display: <SearchHotKeyLabel />,
          },
          { key: "k", display: "K" },
        ],
      }}
    >
      {children}
    </RootProvider>
  );
}
