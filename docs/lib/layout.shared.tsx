import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { CHONKIE_LOGO_URL } from "@/lib/constants";

export const baseOptions: BaseLayoutProps = {
  nav: {
    title: (
      <>
        <img
          src={CHONKIE_LOGO_URL}
          alt="Chonkie"
          width={28}
          height={28}
          className="rounded-sm h-7 w-auto object-contain"
        />
        <span>Chonkie</span>
      </>
    ),
  },
  githubUrl: "https://github.com/chonkie-inc/chonkie",
  links: [{ text: "Discord", url: "https://discord.gg/Q6zkP8w6ur" }],
};
