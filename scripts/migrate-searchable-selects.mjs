import fs from "node:fs";
import path from "node:path";

const root = path.resolve("src");
const componentPath = path.normalize(path.join(root, "components", "SearchableSelect.tsx"));
const importLine = 'import SearchableSelect from "@/components/SearchableSelect";';

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.isFile() && full.endsWith(".tsx") ? [full] : [];
  });
}

let filesChanged = 0;
let selectCount = 0;

for (const file of walk(root)) {
  if (path.normalize(file) === componentPath) continue;
  let source = fs.readFileSync(file, "utf8");
  const opening = source.match(/<select(?=[\s>])/g)?.length ?? 0;
  const closing = source.match(/<\/select\s*>/g)?.length ?? 0;
  if (!opening && !closing) continue;

  source = source.replace(/<select(?=[\s>])/g, "<SearchableSelect");
  source = source.replace(/<\/select\s*>/g, "</SearchableSelect>");

  if (!source.includes(importLine)) {
    source = `${importLine}\n${source}`;
  }

  fs.writeFileSync(file, source, "utf8");
  filesChanged += 1;
  selectCount += opening;
  console.log(`migrated ${file}: ${opening} select(s)`);
}

console.log(`Searchable select migration complete: ${selectCount} dropdown(s) across ${filesChanged} file(s).`);
