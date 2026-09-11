# NAVILO Report Customization Standard

All operational, accounting and management reports should converge on this shared behavior.

## Filters
- Date range and common presets
- Company / Business Unit / Branch scope where authorized
- Relevant party, employee, item, invoice type, tax type, status and settlement filters
- Applied filters remain visible on screen and may optionally print

## Customize
- Select/deselect columns
- Reorder columns (target enhancement)
- Compact/standard density
- Portrait/landscape orientation
- Show/hide totals and applied filters
- Sensible report-specific default columns so prints do not become unnecessarily wide
- Saved per-user presets (target enhancement)

## Output
- Screen table follows selected columns
- Print/PDF follows selected columns and print settings
- Excel/CSV exports follow selected columns and current filters
- Totals use the filtered dataset, never the unfiltered dataset

## Sales Person performance
Required measures: invoice count, customers, gross sales, returns, net sales, without-tax business, tax-invoice business, VAT, cash/bank/credit settlement split, received, outstanding, actual COGS, gross profit and margin percent. Party and invoice drill-down required.

## Purchase Person / Buyer performance
Required measures: invoice count, suppliers, gross purchase, without-tax business, tax-invoice business, input VAT, item value, charges/landed-cost components, paid and outstanding. Supplier and invoice drill-down required. Do not label purchase value less cost as profit margin; purchase is not revenue.

## Accounting integrity
All financial reports must use posted/canonical accounting data. Drafts must not contaminate statutory or financial reports. Company/BU/branch isolation and permissions must remain enforced by RLS and application permissions.
