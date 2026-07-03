import { docs } from "collections/server";
import { docs as chonkieDocs } from "collections/chonkie/server";
import { docsProducts, type DocsProduct } from "./docs-products";

export function buildLoaderSourceInput() {
  return {
    docs: docs.toFumadocsSource({ baseDir: "chonkiejs" }),
    chonkie: chonkieDocs.toFumadocsSource(),
  } as const;
}

export function getProductForPageUrl(url: string): DocsProduct | undefined {
  return docsProducts.find(
    (product) =>
      url === product.basePath || url.startsWith(`${product.basePath}/`),
  );
}
