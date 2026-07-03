import type { MDXComponents } from "mdx/types";
import defaultMdxComponents from "fumadocs-ui/mdx";
import { CodeBlock, Pre } from "fumadocs-ui/components/codeblock";
import { Callout } from "fumadocs-ui/components/callout";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import { Step, Steps } from "fumadocs-ui/components/steps";
import { Accordion, Accordions } from "fumadocs-ui/components/accordion";
import { Card, Cards } from "fumadocs-ui/components/card";
import { Files, File, Folder } from "fumadocs-ui/components/files";
import { InlineTOC } from "fumadocs-ui/components/inline-toc";
import { GithubReleases } from "./components/github-releases";
import { ParamField } from "./components/param-field";

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    pre: ({ className, ...props }) => (
      <CodeBlock
        {...props}
        className={[
          "chonkie-codeblock !bg-fd-background shadow-none",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <Pre>{props.children}</Pre>
      </CodeBlock>
    ),
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
    ParamField,
    GithubReleases,
    ...components,
  };
}

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return getMDXComponents(components);
}
