import type { MDXComponents } from "mdx/types";
import defaultMdxComponents from "fumadocs-ui/mdx";
import { Callout } from "fumadocs-ui/components/callout";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import { Step, Steps } from "fumadocs-ui/components/steps";
import { Accordion, Accordions } from "fumadocs-ui/components/accordion";
import { Card, Cards } from "fumadocs-ui/components/card";
import { Files, File, Folder } from "fumadocs-ui/components/files";
import { InlineTOC } from "fumadocs-ui/components/inline-toc";
import { GithubReleases } from "./components/github-releases";

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    Callout,
    Tab,
    Tabs,
    Step,
    Steps,
    Accordion,
    Accordions,
    Card,
    Cards,
    Files,
    File,
    Folder,
    InlineTOC,
    GithubReleases,
    ...components,
  };
}

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return getMDXComponents(components);
}
