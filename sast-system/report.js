const fs = require('fs');
const path = require('path');


function loadResults(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw).results || [];
  } catch (e) {
    console.error(`Не удалось прочитать или распарсить ${filePath}:`, e);
    process.exit(1);
  }
}

function groupByFile(results) {
  return results.reduce((acc, r) => {
    const file = r.path;
    if (!acc[file]) acc[file] = [];
    acc[file].push(r);
    return acc;
  }, {});
}

function generateMarkdown(grouped) {
  let md = '# Semgrep Report\n\n';
  const files = Object.keys(grouped).sort();
  if (!files.length) {
    md += '✅ Нарушений не найдено.\n';
    return md;
  }

  for (const file of files) {
    md += `## 📄 ${file}\n\n`;
    const entries = grouped[file];
    for (const e of entries) {
      const line = e.start.line;
      const sev = e.extra.severity;
      const msg = e.extra.message;
      md += `- **${sev}** at line ${line}: ${msg}\n`;
    }
    md += '\n';
  }

  return md;
}

function main() {
  const jsonPath = process.argv[2] || 'semgrep-results.json';
  const outPath  = 'semgrep-report.md';

  const results = loadResults(jsonPath);
  const grouped = groupByFile(results);
  const markdown = generateMarkdown(grouped);

  fs.writeFileSync(outPath, markdown, 'utf-8');
  console.log(`Markdown-отчёт сгенерирован в ${outPath}`);
}

main();