import fs from 'node:fs';

function removeExact(text, snippet, label) {
  if (!text.includes(snippet)) {
    console.log(`${label}: already absent`);
    return text;
  }
  console.log(`${label}: removed`);
  return text.replace(snippet, '');
}

{
  const path = 'src/modules/accounting/JournalEntryList.tsx';
  let s = fs.readFileSync(path, 'utf8');
  s = removeExact(
    s,
    `          <button\n            type="button"\n            onClick={downloadExcelTemplate}\n            className="px-4 py-2.5 text-sm font-semibold flex items-center gap-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 rounded-lg"\n          >\n            ↓ Template (.xlsx)\n          </button>\n\n`,
    'Journal list Template (.xlsx) action',
  );
  fs.writeFileSync(path, s);
}

{
  const path = 'src/modules/accounting/JournalEntryDetail.tsx';
  let s = fs.readFileSync(path, 'utf8');
  s = removeExact(
    s,
    `                    <button\n                      type="button"\n                      onClick={\n                        handleDownloadTemplate\n                      }\n                      disabled={\n                        importing ||\n                        saving ||\n                        posting\n                      }\n                      className="px-4 py-2 bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-100 text-sm font-semibold rounded-lg"\n                    >\n                      ↓ Download Excel Template\n                    </button>\n\n`,
    'Journal detail Download Excel Template action',
  );
  fs.writeFileSync(path, s);
}

console.log('Journal template buttons removed.');
