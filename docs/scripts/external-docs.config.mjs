/**
 * External docs synced at build/dev time into workspace folders.
 *
 * To add another synced docs package:
 * 1. Add an entry here (envVar + outDir)
 * 2. Register a workspace in `source.config.ts`
 * 3. Import `collections/<outDir>/server` in `lib/doc-collections.ts`
 * 4. Add a product in `lib/docs-products.ts`
 */

/** Rewrite /assets/ paths to the chonkie static site (extension mode). */
export function rewriteMdxAssetUrls(content, assetsBaseUrl) {
  const base = assetsBaseUrl.replace(/\/$/, "");
  return content
    .replace(/(\]\()\/assets\//g, `$1${base}/assets/`)
    .replace(/(src=")\/assets\//g, `$1${base}/assets/`);
}

export const externalDocSources = [
  {
    id: "chonkie",
    envVar: "CHONKIE_DOCS_URL",
    outDir: "chonkie",
    /** When true, synced MDX points images at CHONKIE_DOCS_URL instead of /assets/. */
    rewriteAssetUrls: true,
    transforms: [
      {
        file: "content/docs/chonkie/changelog.mdx",
        replacements: [
          [
            "<GithubReleases />",
            '<GithubReleases src="/data/releases.json" />',
          ],
        ],
      },
    ],
  },
];
