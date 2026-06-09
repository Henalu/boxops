import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const exportDir = path.join(projectRoot, "docs", "user-guides", "export");

async function main() {
  const files = await fs.readdir(exportDir);
  const htmlFiles = files
    .filter((file) => file.startsWith("boxops-guia-") && file.endsWith(".html"))
    .sort();

  const browser = await chromium.launch();
  const page = await browser.newPage();

  for (const htmlFile of htmlFiles) {
    const inputPath = path.join(exportDir, htmlFile);
    const outputPath = path.join(exportDir, htmlFile.replace(/\.html$/, ".pdf"));
    await page.goto(`file://${inputPath.replaceAll("\\", "/")}`, {
      waitUntil: "networkidle",
    });
    await page.emulateMedia({ media: "print" });
    await page.pdf({
      displayHeaderFooter: false,
      format: "Letter",
      margin: {
        bottom: "0",
        left: "0",
        right: "0",
        top: "0",
      },
      path: outputPath,
      printBackground: true,
      preferCSSPageSize: true,
    });
    console.log(path.relative(projectRoot, outputPath));
  }

  await browser.close();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
