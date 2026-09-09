import { Link } from "react-router-dom";
import { BusFront, Calculator, ClipboardList, Fuel, Gauge, MapPinned, Truck, Users } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";

const areas = [
  { icon: Truck, title: "Fleet & Vehicles", text: "Vehicle master, registration, ownership and operating status." },
  { icon: Users, title: "Drivers & Crew", text: "Transport staff and driver assignments." },
  { icon: MapPinned, title: "Trips & Dispatch", text: "Bookings, routes, dispatch and delivery workflow." },
  { icon: ClipboardList, title: "Freight Billing", text: "Customer freight jobs and transport billing." },
  { icon: Fuel, title: "Fuel / Toll / Trip Cost", text: "Trip expenses and operating cost control." },
  { icon: Gauge, title: "Transport Reports", text: "Vehicle, trip, revenue and cost reporting." },
];

export default function TransportWorkspace() {
  const { activeCompany, activeBusinessUnit } = useAuth();
  return <div className="space-y-4">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><BusFront className="h-6 w-6 text-blue-700"/><h1 className="text-xl font-black text-slate-900">NAVILO Transport ERP</h1></div>
          <p className="mt-1 text-sm text-slate-500">{activeCompany?.company_name ?? "Company"} · {activeBusinessUnit?.business_unit_name ?? "Transport Service"}</p>
          <p className="mt-3 max-w-3xl text-sm text-slate-600">This workspace is isolated from Steel production/cutting. Core accounting, master data, reports and settings remain reusable across business lines.</p>
        </div>
        <Link className="btn-secondary" to="/accounting"><Calculator className="h-4 w-4"/>Open Accounting</Link>
      </div>
    </section>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{areas.map(({icon:Icon,title,text})=><section key={title} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><Icon className="h-5 w-5 text-blue-700"/><h2 className="mt-3 font-black text-slate-900">{title}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{text}</p></section>)}</div>
    <section className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900"><strong>Modular foundation active.</strong> Transport business logic can now be developed inside this service without exposing Steel Mill production screens or rebuilding NAVILO from zero.</section>
  </div>;
}
