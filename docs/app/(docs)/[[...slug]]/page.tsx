import { source } from "@/lib/source";
import {
  DocsPage,
  DocsBody,
  DocsTitle,
  DocsDescription,
} from "fumadocs-ui/page";
import { redirect } from "next/navigation";
import { getMDXComponents } from "@/mdx-components";
import { CHONKIE_QUICK_START, CHONKIEJS_QUICK_START } from "@/lib/constants";

function shouldRedirectToDefault(slug: string): boolean {
  if (slug === "overview" || slug.startsWith("overview/")) return true;
  return false;
}

export default async function Page(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const params = await props.params;

  if (!params.slug || params.slug.length === 0) {
    redirect(CHONKIE_QUICK_START);
  }

  const slug = params.slug.join("/");

  if (shouldRedirectToDefault(slug)) {
    redirect(CHONKIE_QUICK_START);
  }

  if (slug === "python" || slug === "chonkie") redirect(CHONKIE_QUICK_START);
  if (slug === "chonkiejs") redirect(CHONKIEJS_QUICK_START);

  const page = source.getPage(params.slug);
  if (!page) redirect(CHONKIE_QUICK_START);

  const MDX = page.data.body;

  return (
    <DocsPage
      toc={page.data.toc}
      className="!max-w-none w-full md:!px-5 xl:!px-6"
    >
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX components={getMDXComponents()} />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return [
    { slug: [] },
    { slug: ["chonkie"] },
    { slug: ["chonkiejs"] },
    ...source.generateParams(),
  ];
}

export async function generateMetadata(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const params = await props.params;
  if (!params.slug || params.slug.length === 0) {
    return { title: "Documentation", description: "Chonkie Documentation" };
  }

  const slug = params.slug.join("/");
  if (shouldRedirectToDefault(slug)) {
    redirect(CHONKIE_QUICK_START);
  }

  const page = source.getPage(params.slug);
  if (!page) redirect(CHONKIE_QUICK_START);

  return {
    title: page.data.title,
    description: page.data.description,
    openGraph: {
      title: page.data.title,
      description: page.data.description,
      siteName: "Chonkie",
    },
  };
}
