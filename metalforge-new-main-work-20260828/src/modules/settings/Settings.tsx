import { NavLink, Routes, Route } from "react-router-dom";
import CompanySettings from "./CompanySettings";
import TaxSettings from "./TaxSettings";
import DocumentPrintSettings from "./DocumentPrintSettings";

export default function Settings() {
  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
        <Tab to="/settings" end label="Company / کمپنی" />
        <Tab to="/settings/tax" label="Tax & Charges / ٹیکس و چارجز" />
        <Tab to="/settings/documents" label="Document & Print / ڈاکومنٹ و پرنٹ" />
      </div>

      <Routes>
        <Route path="/" element={<CompanySettings />} />
        <Route path="/tax" element={<TaxSettings />} />
        <Route path="/documents" element={<DocumentPrintSettings />} />
      </Routes>
    </div>
  );
}

function Tab({
  to,
  label,
  end,
}: {
  to: string;
  label: string;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `inline-block whitespace-nowrap border-b-2 px-4 py-2.5 text-xs font-semibold ${
          isActive
            ? "border-blue-600 text-blue-600"
            : "border-transparent text-slate-500"
        }`
      }
    >
      {label}
    </NavLink>
  );
}
