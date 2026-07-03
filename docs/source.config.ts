import { defineDocs, defineConfig } from "fumadocs-mdx/config";
import * as chonkieConfig from "./chonkie/source.config";

export const docs = defineDocs({
  dir: "content/docs",
});

export default defineConfig({
  workspaces: {
    chonkie: {
      dir: "./chonkie",
      config: chonkieConfig,
    },
  },
});
