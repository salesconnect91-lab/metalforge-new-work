import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";

export default function CompanySwitcher({ compact = false }: { compact?: boolean }) {
  const { activeCompany, availableCompanies, switchCompany, switchingCompany } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  if (availableCompanies.length <= 1) {
    return compact ? null : (
      <div className="max-w-[220px] truncate text-[11px] font-semibold text-slate-700">
        {activeCompany?.company_name ?? "No company"}
      </div>
    );
  }

  return (
    <div className={compact ? "w-full" : "min-w-[180px]"}>
      <select
        aria-label="Active company"
        className={compact ? "w-full rounded border border-white/10 bg-slate-900 px-2 py-1 text-[10px] font-semibold text-slate-300" : "w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700"}
        value={activeCompany?.company_id ?? ""}
        disabled={switchingCompany}
        onChange={(event) => {
          const companyId = event.target.value;
          if (!companyId) return;
          setError("");
          void switchCompany(companyId).then(({ error: switchError }) => {
            if (switchError) {
              setError(switchError);
              return;
            }
            navigate("/");
          });
        }}
      >
        {availableCompanies.map((company) => (
          <option key={company.company_id} value={company.company_id}>
            {company.company_name} ({company.company_code})
          </option>
        ))}
      </select>
      {error && <div className="mt-1 text-[9px] text-red-500">{error}</div>}
    </div>
  );
}
