import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";

export default function CompanySwitcher() {
  const { activeCompany, availableCompanies, switchCompany, switchingCompany } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  if (availableCompanies.length <= 1) return null;

  return (
    <div className="fixed right-[116px] top-[10px] z-40 hidden min-w-[190px] md:block">
      <select
        aria-label="Active company"
        className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm"
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
      {error && <div className="mt-1 rounded bg-red-50 px-2 py-1 text-[9px] text-red-600 shadow">{error}</div>}
    </div>
  );
}
