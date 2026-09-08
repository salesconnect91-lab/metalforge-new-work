import { BookOpenCheck, Settings2 } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

export default function OrderBookQuickAccess(){
 const {pathname}=useLocation();
 const sales=pathname==="/sales"||pathname.startsWith("/sales/");
 const purchase=pathname==="/purchase"||pathname.startsWith("/purchase/");
 const orderBook=pathname.includes("order-book");
 if(!sales&&!purchase)return null;

 // The Order Book page owns its report/export toolbar. Keeping the old floating
 // report control here caused a visible flash during refresh before ActionHub
 // moved/hid it, so render nothing on Order Book routes.
 if(orderBook)return null;

 return <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2 print:hidden">
  <Link to="/settings/order-book" title="Order Book Settings" className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-lg hover:bg-slate-50"><Settings2 className="h-4 w-4"/></Link>
  <Link to={sales?"/sales/order-book":"/purchase/order-book"} className="flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2.5 text-sm font-black text-white shadow-xl hover:bg-blue-700"><BookOpenCheck className="h-4 w-4"/>{sales?"Sales Order Book / سیلز آرڈر بک":"Purchase Order Book / پرچیز آرڈر بک"}</Link>
 </div>
}
