import { NavLink } from "react-router-dom";
import SalespersonReport from "./SalespersonReport";

export default function SalespersonReportHub(){
  return <div className="space-y-4">
    <div className="no-print flex flex-wrap gap-2 rounded-xl border bg-white p-3">
      <NavLink to="/sales/report" className="btn-primary">Salesperson Performance</NavLink>
      <NavLink to="/sales/person-ledger" className="btn-secondary">Salesperson Ledger</NavLink>
    </div>
    <SalespersonReport />
  </div>;
}
