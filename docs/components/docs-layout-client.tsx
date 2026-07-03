"use client";

import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import type * as PageTree from "fumadocs-core/page-tree";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useMemo, type ReactNode } from "react";
import { filterPageTreeForProduct } from "@/lib/filter-tree";
import { getProductFromPath } from "@/lib/product-routes";

const ProductSwitcher = dynamic(
  () =>
    import("@/components/product-switcher").then((mod) => mod.ProductSwitcher),
  {
    ssr: false,
    loading: () => (
      <div
        aria-hidden
        className="relative -mx-4 border-y border-fd-border px-4 py-2.5"
      >
        <div className="h-5 w-24 animate-pulse rounded bg-fd-muted" />
      </div>
    ),
  },
);

type DocsLayoutClientProps = BaseLayoutProps & {
  tree: PageTree.Root;
  children: ReactNode;
};

export function DocsLayoutClient({
  tree,
  children,
  ...baseOptions
}: DocsLayoutClientProps) {
  const pathname = usePathname() ?? "/";
  const productId = getProductFromPath(pathname).id;

  const filteredTree = useMemo(
    () => filterPageTreeForProduct(tree, productId),
    [tree, productId],
  );

  return (
    <DocsLayout
      key={productId}
      tree={filteredTree}
      tabs={false}
      containerProps={{
        style: {
          gridTemplateColumns:
            "minmax(0, clamp(1rem, 2vw, 1.5rem)) var(--fd-sidebar-col) minmax(0, 1fr) var(--fd-toc-width) minmax(0, clamp(1rem, 2vw, 1.5rem))",
        },
      }}
      sidebar={{
        banner: <ProductSwitcher key="product-switcher" />,
      }}
      {...baseOptions}
    >
      {children}
    </DocsLayout>
  );
}
