import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const REPO = 'chonkie-inc/chonkiejs';
const OUT_DIR = path.resolve('public', 'data');
const OUT_FILE = path.join(OUT_DIR, 'releases.json');

async function fetchReleases() {
  console.log(`[Releases] Fetching releases from ${REPO}...`);

  const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=50`, {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      ...(process.env.GITHUB_TOKEN && { 'Authorization': `token ${process.env.GITHUB_TOKEN}` }),
    },
  });

  if (!res.ok) {
    console.error(`[Releases] Failed to fetch: ${res.status} ${res.statusText}`);
    console.error('[Releases] Skipping release sync (using cached data if available)');
    return;
  }

  const releases = await res.json();

  const simplified = releases.map((r) => ({
    id: r.id,
    name: r.name || r.tag_name,
    tag: r.tag_name,
    published_at: r.published_at,
    body: r.body || '',
    html_url: r.html_url,
  }));

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(simplified, null, 2));
  console.log(`[Releases] Saved ${simplified.length} releases to ${OUT_FILE}`);
}

fetchReleases().catch((err) => {
  console.error('[Releases] Error:', err.message);
  console.error('[Releases] Skipping release sync');
});
