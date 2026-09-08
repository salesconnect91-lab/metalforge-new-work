import { BookOpenCheck, Settings2 } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

export default function OrderBookQuickAccess(){
 const {pathname}=useLocation();
 const salesHome=pathname==="/sales";
 const purchaseHome=pathname==="/purchase";
 if(!salesHome&&!purchaseHome)return null;

 // Quick access belongs on the Sales/Purchase landing pages only.
 // Transaction, invoice, consolidated and Order Book screens already have their
 // own native actions; a fixed floating control can cover row/action buttons.
 const sales=salesHome;

 return <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2 print:hidden">
  <Link to="/settings/order-book" title="Order Book Settings" className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-lg hover:bg-slate-50"><Settings2 className="h-4 w-4"/></Link>
  <Link to={sales?"/sales/order-book":"/purchase/order-book"} className="flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2.5 text-sm font-black text-white shadow-xl hover:bg-blue-700"><BookOpenCheck className="h-4 w-4"/>{sales?"Sales Order Book / سیلز آرڈر بک":"Purchase Order Book / پرچیز آرڈر بک"}</Link>
 </div>
}
