import fs from 'node:fs';

function patchFile(path, edits) {
  let s = fs.readFileSync(path, 'utf8');
  let changed = false;
  for (const [name, find, replace] of edits) {
    if (s.includes(replace)) continue;
    if (!s.includes(find)) {
      console.warn(`[invoice-description] skipped ${path}: ${name}`);
      continue;
    }
    s = s.replace(find, replace);
    changed = true;
  }
  if (changed) fs.writeFileSync(path, s);
}

patchFile('src/modules/sales/SalesInvoiceCreate.tsx', [
  ['row type',
`interface InvoiceRow {
  item_id: string;
  qty: string;
  rate: string;
  tax_percent: string;
  godown_id: string;
}`,
`interface InvoiceRow {
  item_id: string;
  qty: string;
  rate: string;
  tax_percent: string;
  godown_id: string;
  description: string;
}`],
  ['loaded line type',
`interface LineDataRecord {
  item_id: string;
  qty: number | string;
  unit_price: number | string;
  tax_percent?: number | string;
  godown_id?: string | null;
}`,
`interface LineDataRecord {
  item_id: string;
  qty: number | string;
  unit_price: number | string;
  tax_percent?: number | string;
  godown_id?: string | null;
  description?: string | null;
}`],
  ['initial row',
`{ item_id: "", qty: "0", rate: "0", tax_percent: "0", godown_id: "" },`,
`{ item_id: "", qty: "0", rate: "0", tax_percent: "0", godown_id: "", description: "" },`],
  ['load description',
`              godown_id: l.godown_id ? String(l.godown_id) : "",
            }))`,
`              godown_id: l.godown_id ? String(l.godown_id) : "",
              description: l.description ? String(l.description) : "",
            }))`],
  ['new row description',
`        godown_id: godowns[0]?.id ?? "",
      },`,
`        godown_id: godowns[0]?.id ?? "",
        description: "",
      },`],
  ['payload description',
`        godown_id: r.godown_id || null,
        line_total:`,
`        godown_id: r.godown_id || null,
        description: r.description.trim() || null,
        line_total:`],
  ['item input description',
`                          </select>
                        </td>

                        <td className="px-2 py-2">`,
`                          </select>
                          <input
                            className="input mt-1"
                            disabled={isLocked}
                            value={row.description}
                            onChange={(event) => updateRow(index, "description", event.target.value)}
                            placeholder="Optional description / تفصیل"
                          />
                        </td>

                        <td className="px-2 py-2">`],
  ['preview description',
`<td className="border border-slate-300 px-2 py-2 font-semibold">{item?.name || "—"}<div className="text-[12px] font-normal text-slate-400">SKU: {item?.sku || "—"}</div></td>`,
`<td className="border border-slate-300 px-2 py-2 font-semibold">{item?.name || "—"}<div className="text-[12px] font-normal text-slate-400">SKU: {item?.sku || "—"}</div>{r.description && <div className="mt-1 text-[12px] font-normal text-slate-600">{r.description}</div>}</td>`],
]);

patchFile('src/modules/sales/ConsolidatedInvoices.tsx', [
  ['row type',
`type InvoiceRow = {
  id?: string;
  item_id: string;
  godown_id: string;
  qty: string;
  rate: string;
  tax_percent: string;
};`,
`type InvoiceRow = {
  id?: string;
  item_id: string;
  godown_id: string;
  qty: string;
  rate: string;
  tax_percent: string;
  description: string;
};`],
  ['empty row',
`  rate: "0",
  tax_percent: tax,
});`,
`  rate: "0",
  tax_percent: tax,
  description: "",
});`],
  ['select description',
`          "id,item_id,godown_id,qty,unit_price,tax_percent"`,
`          "id,item_id,godown_id,qty,unit_price,tax_percent,description"`],
  ['load description',
`            tax_percent: String(row.tax_percent ?? 0),
          }))`,
`            tax_percent: String(row.tax_percent ?? 0),
            description: String(row.description ?? ""),
          }))`],
  ['payload description',
`        unit_price: Number(row.rate) || 0,
        tax_percent:`,
`        unit_price: Number(row.rate) || 0,
        description: row.description.trim() || null,
        tax_percent:`],
  ['item input description',
`                        </select>
                      </td>

                      <td className="px-2 py-2">`,
`                        </select>
                        <input
                          className="input mt-1"
                          disabled={isLocked}
                          value={row.description}
                          onChange={(e) => updateRow(index, "description", e.target.value)}
                          placeholder="Optional description / تفصیل"
                        />
                      </td>

                      <td className="px-2 py-2">`],
  ['print description',
`        name: item?.name || "—",
        grade: null,`,
`        name: item?.name || "—",
        description: row.description.trim() || null,
        grade: null,`],
]);

patchFile('src/components/PrintLayout.tsx', [
  ['print item type',
`export interface PrintItemRow {
  name: string;
  grade?: string | null;`,
`export interface PrintItemRow {
  name: string;
  description?: string | null;
  grade?: string | null;`],
  ['print item description',
`                <td className="print-td" style={{ fontWeight: 500 }}>{item.name}</td>`,
`                <td className="print-td" style={{ fontWeight: 500 }}>
                  <div>{item.name}</div>
                  {item.description && (
                    <div style={{ marginTop: "3px", fontSize: "9px", lineHeight: 1.3, fontWeight: 400, color: "#475569" }}>
                      {item.description}
                    </div>
                  )}
                </td>`],
]);

patchFile('src/modules/sales/SalesInvoiceDetail.tsx', [
  ['pdf item description',
`                line.item?.name || "—",
                line.grade || "—",`,
`                [line.item?.name || "—", line.description || ""].filter(Boolean).join("\n"),
                line.grade || "—",`],
  ['detail item description',
`                          {line.item?.name ?? "—"}
                        </td>`,
`                          {line.item?.name ?? "—"}
                          {line.description && (
                            <div className="mt-1 text-[12px] font-normal text-slate-500">
                              {line.description}
                            </div>
                          )}
                        </td>`],
  ['print layout description',
`            name: line.item?.name ?? "—",
            grade: line.grade,`,
`            name: line.item?.name ?? "—",
            description: line.description ?? null,
            grade: line.grade,`],
]);

console.log('[invoice-description] sales + consolidated description wiring applied');
