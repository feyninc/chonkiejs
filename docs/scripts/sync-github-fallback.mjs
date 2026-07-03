const GITHUB_API = "https://api.github.com";

/**
 * Build a manifest from the chonkie repo when GitHub Pages has no manifest.json yet.
 * Paths match copy-source.mjs output (relative to docs/).
 */
export async function buildManifestFromGithub({
  owner,
  repo,
  branch,
}) {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    { headers: { Accept: "application/vnd.github+json" } },
  );

  if (!res.ok) {
    throw new Error(
      `GitHub tree fetch failed for ${owner}/${repo}@${branch}: ${res.status}`,
    );
  }

  const { tree } = await res.json();
  const files = [];

  for (const item of tree) {
    if (item.type !== "blob") continue;
    if (!item.path.startsWith("docs/")) continue;

    const rel = item.path.slice("docs/".length);

    if (rel === "source.config.ts") {
      files.push("source.config.ts");
      continue;
    }

    if (rel.startsWith("content/docs/")) {
      files.push(rel);
      continue;
    }

    if (rel.startsWith("public/") && !rel.startsWith("public/data/")) {
      files.push(rel);
    }
  }

  files.sort();
  return { files };
}

export function rawGithubFileUrl({ owner, repo, branch }, filePath) {
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/docs/${filePath}`;
}
