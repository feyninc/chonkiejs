export const CHONKIE_QUICK_START = "/chonkie/quick-start";

export const CHONKIEJS_QUICK_START = "/chonkiejs/getting-started/quick-start";

export const DOCS_SITE_URL =
  process.env.NEXT_PUBLIC_DOCS_SITE_URL ?? "https://js.docs.chonkie.ai";

/** Canonical chonkie static docs host (client-safe for logos / favicons). */
export const CHONKIE_DOCS_ASSETS_URL =
  process.env.NEXT_PUBLIC_CHONKIE_DOCS_URL ??
  "https://feyninc.github.io/chonkie";

export const CHONKIE_LOGO_URL = `${CHONKIE_DOCS_ASSETS_URL}/assets/logo/chonkie_logo_br_transparent_bg.png`;
