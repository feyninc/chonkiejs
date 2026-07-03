import { createFromSource } from "fumadocs-core/search/server";
import { findPath } from "fumadocs-core/page-tree";
import type * as PageTree from "fumadocs-core/page-tree";
import { getProductForPageUrl } from "@/lib/doc-collections";
import { findProductFolderInTree } from "@/lib/filter-tree";
import { source } from "@/lib/source";

type DocsPage = ReturnType<typeof source.getPages>[number];

async function resolveStructuredData(page: DocsPage) {
  const data = page.data as {
    structuredData?: unknown | (() => unknown | Promise<unknown>);
    load?: () => Promise<{ structuredData?: unknown }>;
  };

  if (data.structuredData) {
    return typeof data.structuredData === "function"
      ? await data.structuredData()
      : data.structuredData;
  }

  if (typeof data.load === "function") {
    return (await data.load()).structuredData;
  }

  return undefined;
}

function folderTitleFromUrl(folder: PageTree.Folder, segment: string): boolean {
  const url =
    folder.index?.url ??
    folder.children.find((c) => c.type === "page")?.url;

  if (!url || typeof url !== "string") return false;
  return url.split("/").filter(Boolean).includes(segment);
}

function resolveBreadcrumbsFromUrl(
  tree: PageTree.Root,
  url: string,
  productSlug: string | null,
): string[] {
  const segments = url.split("/").filter(Boolean);
  if (productSlug && segments[0] === productSlug) {
    segments.shift();
  }

  const productFolder = productSlug
    ? findProductFolderInTree(tree, productSlug)
    : null;
  let nodes = productFolder?.children ?? tree.children;
  const breadcrumbs: string[] = [];

  for (const segment of segments.slice(0, -1)) {
    const folder = nodes.find(
      (node): node is PageTree.Folder =>
        node.type === "folder" && folderTitleFromUrl(node, segment),
    );

    if (!folder) break;

    if (folder.name) breadcrumbs.push(String(folder.name));
    nodes = folder.children;
  }

  return breadcrumbs;
}

function resolveTreeBreadcrumbs(page: DocsPage): string[] {
  const product = getProductForPageUrl(page.url);
  const productSlug = product?.id ?? null;
  const pageTree = source.getPageTree(page.locale);

  const searchRoots: PageTree.Node[][] = [];
  if (productSlug) {
    const productFolder = findProductFolderInTree(pageTree, productSlug);
    if (productFolder) searchRoots.push(productFolder.children);
  }
  searchRoots.push(pageTree.children);

  let path: PageTree.Node[] | null = null;
  for (const roots of searchRoots) {
    path = findPath(
      roots,
      (node) => node.type === "page" && node.url === page.url,
    );
    if (path) break;
  }

  if (!path) {
    return resolveBreadcrumbsFromUrl(pageTree, page.url, productSlug);
  }

  path.pop();
  const breadcrumbs: string[] = [];
  for (const segment of path) {
    if (segment.name) breadcrumbs.push(String(segment.name));
  }

  return breadcrumbs;
}

function buildSearchBreadcrumbs(
  product: ReturnType<typeof getProductForPageUrl>,
  treeBreadcrumbs: string[],
): string[] | undefined {
  if (!product) return treeBreadcrumbs.length > 0 ? treeBreadcrumbs : undefined;

  const crumbs = [
    product.label,
    ...treeBreadcrumbs.filter(
      (crumb) => crumb.toLowerCase() !== product.label.toLowerCase(),
    ),
  ];

  return crumbs.length > 0 ? crumbs : undefined;
}

async function buildPageSearchIndex(page: DocsPage) {
  const structuredData = await resolveStructuredData(page);
  if (!structuredData) {
    throw new Error(
      `Cannot index "${page.url}": missing structured data. Ensure the page is valid MDX.`,
    );
  }

  const product = getProductForPageUrl(page.url);
  const treeBreadcrumbs = resolveTreeBreadcrumbs(page);
  const breadcrumbs = buildSearchBreadcrumbs(product, treeBreadcrumbs);

  return {
    id: page.url,
    title: page.data.title ?? page.url,
    description: page.data.description,
    url: page.url,
    breadcrumbs,
    structuredData,
  };
}

export const searchServer = createFromSource(source, {
  buildIndex: buildPageSearchIndex,
  search: {
    limit: 24,
    groupBy: {
      properties: ["page_id"],
      maxResult: 12,
    },
  },
});
