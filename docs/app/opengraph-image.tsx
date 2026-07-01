import { generateOGImage } from "fumadocs-ui/og";

export const dynamic = "force-static";
export const alt = "ChonkieJS Documentation";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return generateOGImage({
    title: "ChonkieJS",
    description:
      "The lightweight JavaScript chunking library for RAG pipelines",
    site: "ChonkieJS",
    primaryColor: "#a7896c",
    primaryTextColor: "#faf6e3",
  });
}
