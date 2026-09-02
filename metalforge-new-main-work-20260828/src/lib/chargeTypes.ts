export interface ChargeType {
  key: string;
  label: string;
  dbColumn: string;
  appliesTo: ("sales" | "purchase")[];
}

export const CHARGE_TYPES: ChargeType[] = [
  { key: "loading", label: "Loading Charges", dbColumn: "loading_charge", appliesTo: ["sales", "purchase"] },
  { key: "unloading", label: "Unloading Charges", dbColumn: "unloading_charge", appliesTo: ["sales", "purchase"] },
  { key: "cutting", label: "Cutting Charges", dbColumn: "cutting_charge", appliesTo: ["sales", "purchase"] },
  { key: "transport", label: "Transport Freight", dbColumn: "transport_charge", appliesTo: ["sales", "purchase"] },
  { key: "labour", label: "Labour Charges", dbColumn: "labour_charge", appliesTo: ["sales", "purchase"] },
  { key: "handling", label: "Handling Charges", dbColumn: "handling_charge", appliesTo: ["sales", "purchase"] },
  { key: "other", label: "Other Charges", dbColumn: "other_charge", appliesTo: ["sales", "purchase"] },
];

export type ChargeValues = Record<string, string>;

export function createEmptyCharges(): ChargeValues {
  return CHARGE_TYPES.reduce((acc, ct) => {
    acc[ct.key] = "0";
    return acc;
  }, {} as ChargeValues);
}

export function getChargesForContext(context: "sales" | "purchase"): ChargeType[] {
  return CHARGE_TYPES.filter((ct) => ct.appliesTo.includes(context));
}

export function calculateChargeTotal(charges: ChargeValues): number {
  return CHARGE_TYPES.reduce((sum, ct) => {
    return sum + (parseFloat(charges[ct.key]) || 0);
  }, 0);
}

export function calculateChargeTotalForContext(
  charges: ChargeValues,
  context: "sales" | "purchase",
): number {
  return getChargesForContext(context).reduce((sum, ct) => {
    return sum + (parseFloat(charges[ct.key]) || 0);
  }, 0);
}

export interface ChargeBreakdownEntry {
  label: string;
  amount: number;
}

export function getChargeBreakdown(
  charges: ChargeValues,
  context: "sales" | "purchase",
): ChargeBreakdownEntry[] {
  return getChargesForContext(context)
    .map((ct) => ({
      label: ct.label,
      amount: parseFloat(charges[ct.key]) || 0,
    }))
    .filter((entry) => entry.amount > 0);
}

export function buildChargePayload(charges: ChargeValues): Record<string, number> {
  return CHARGE_TYPES.reduce((acc, ct) => {
    acc[ct.dbColumn] = parseFloat(charges[ct.key]) || 0;
    return acc;
  }, {} as Record<string, number>);
}

export function chargesFromRecord(record: Record<string, unknown>): ChargeValues {
  const result = createEmptyCharges();
  for (const ct of CHARGE_TYPES) {
    if (record[ct.dbColumn] !== undefined && record[ct.dbColumn] !== null) {
      result[ct.key] = String(record[ct.dbColumn]);
    }
  }
  return result;
}
