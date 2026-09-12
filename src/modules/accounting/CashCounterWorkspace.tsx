import { NavLink } from "react-router-dom";
import CashCounter from "./CashCounter";

export default function CashCounterWorkspace(){
  return <div className="space-y-4">
    <div className="no-print flex flex-wrap gap-2 rounded-xl border bg-white p-3">
      <NavLink to="/accounting/cash-counter" className={({isActive})=>isActive?"btn-primary":"btn-secondary"}>Cash Counter</NavLink>
      <NavLink to="/accounting/payroll" className="btn-secondary">Payroll & Salary Ledger</NavLink>
      <NavLink to="/accounting/loans" className="btn-secondary">Loan & Lender Ledger</NavLink>
    </div>
    <CashCounter />
  </div>;
}
