import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  externalDocSources,
  rewriteMdxAssetUrls,
} from "./external-docs.config.mjs";
import {
  buildManifestFromGithub,
  rawGithubFileUrl,
} from "./sync-github-fallback.mjs";

const envPath = path.resolve(".env");
if (existsSync(envPath)) {
  const envContent = await readFile(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim();
    }
  }
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.text();
}

async function fetchBinary(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function isBinaryFile(filePath) {
  return /\.(png|jpe?g|gif|webp|svg|ico|woff2?)$/i.test(filePath);
}

function applyTransforms(content, transforms = []) {
  let next = content;
  for (const transform of transforms) {
    for (const [from, to] of transform.replacements ?? []) {
      next = next.replace(from, to);
    }
  }
  return next;
}

function resolveGithubFallback(source) {
  const owner =
    process.env.CHONKIE_DOCS_GITHUB_OWNER ?? source.githubFallback?.owner;
  const repo = process.env.CHONKIE_DOCS_GITHUB_REPO ?? source.githubFallback?.repo;
  const branch =
    process.env.CHONKIE_DOCS_GITHUB_BRANCH ?? source.githubFallback?.branch;

  if (!owner || !repo || !branch) return null;
  return { owner, repo, branch };
}

async function loadManifest(source, baseUrl) {
  const manifestUrl = `${baseUrl}/manifest.json`;

  try {
    const manifest = JSON.parse(await fetchText(manifestUrl));
    return { manifest, source: "pages" };
  } catch (error) {
    const fallback = resolveGithubFallback(source);
    if (!fallback) throw error;

    console.warn(
      `manifest.json not found at ${manifestUrl} — falling back to GitHub (${fallback.owner}/${fallback.repo}@${fallback.branch}).`,
    );

    const manifest = await buildManifestFromGithub(fallback);
    return { manifest, source: "github", github: fallback };
  }
}

async function syncSource(source) {
  const baseUrl = process.env[source.envVar];
  if (!baseUrl) {
    console.error(`${source.envVar} env variable is not set (check .env file)`);
    process.exit(1);
  }

  const base = baseUrl.replace(/\/$/, "");
  const outDir = path.resolve(source.outDir);
  const publicDir = path.resolve("public");

  console.log(`Syncing ${source.id} docs from ${base}...`);

  const { manifest, source: manifestSource, github } = await loadManifest(
    source,
    base,
  );

  for (const filePath of manifest.files) {
    const isPublicAsset = filePath.startsWith("public/");

    if (isPublicAsset && source.rewriteAssetUrls) {
      continue;
    }

    const url =
      manifestSource === "github" && github
        ? rawGithubFileUrl(github, filePath)
        : `${base}/${filePath}`;
    const dest = isPublicAsset
      ? path.join(publicDir, filePath.slice("public/".length))
      : path.join(outDir, filePath);

    await mkdir(path.dirname(dest), { recursive: true });

    if (isBinaryFile(filePath)) {
      const content = await fetchBinary(url);
      await writeFile(dest, content);
    } else {
      let content = await fetchText(url);

      const fileTransforms = source.transforms?.filter(
        (transform) => transform.file === filePath,
      );
      content = applyTransforms(content, fileTransforms);

      if (
        source.rewriteAssetUrls &&
        filePath.endsWith(".mdx") &&
        filePath.includes("content/")
      ) {
        content = rewriteMdxAssetUrls(content, base);
      }

      await writeFile(dest, content);
    }

    console.log(`  ${filePath}`);
  }

  console.log(`Done syncing ${source.id}.`);
}

async function syncAll() {
  for (const source of externalDocSources) {
    await syncSource(source);
  }
}

await syncAll();
