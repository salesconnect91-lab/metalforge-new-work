import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabase";

type Employee = { id: string; name: string };

export default function SalesInvoiceEmployeeSalespersonBridge() {
  const { pathname } = useLocation();
  const active = pathname === "/sales/new" || /^\/sales\/[0-9a-f-]{36}\/edit$/i.test(pathname);
  const employeesRef = useRef<Employee[]>([]);
  const preferredIdRef = useRef<string>("");

  useEffect(() => {
    if (!active) return;
    let alive = true;

    void (async () => {
      const [{ data: employees, error: employeeError }, invoiceResult] = await Promise.all([
        supabase
          .from("employees")
          .select("id,name")
          .eq("is_active", true)
          .order("name"),
        /^\/sales\/[0-9a-f-]{36}\/edit$/i.test(pathname)
          ? supabase
              .from("sales_orders")
              .select("salesperson_id,sales_person")
              .eq("id", pathname.split("/")[2])
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (!alive || employeeError) return;
      const list = (employees ?? []) as Employee[];
      employeesRef.current = list;

      const invoice = invoiceResult.data as { salesperson_id?: string | null; sales_person?: string | null } | null;
      preferredIdRef.current =
        invoice?.salesperson_id ||
        list.find((employee) => employee.name === invoice?.sales_person)?.id ||
        "";

      window.dispatchEvent(new Event("navilo-salesperson-employees-ready"));
    })();

    return () => {
      alive = false;
      employeesRef.current = [];
      preferredIdRef.current = "";
    };
  }, [active, pathname]);

  useEffect(() => {
    if (!active) return;

    const sync = () => {
      const labels = Array.from(document.querySelectorAll("label"));
      const label = labels.find((node) => {
        const text = (node.textContent || "").toLowerCase();
        return text.includes("sales person") || text.includes("salesperson") || text.includes("سیلز پرسن");
      });
      if (!label) return;

      const wrapper = label.parentElement;
      const select = wrapper?.querySelector("select") as HTMLSelectElement | null;
      if (!select) return;

      const employees = employeesRef.current;
      const currentValue = select.value;
      const desiredValue = preferredIdRef.current || currentValue;
      const desiredExists = employees.some((employee) => employee.id === desiredValue);

      const signature = employees.map((employee) => `${employee.id}:${employee.name}`).join("|");
      if (select.dataset.employeeSignature !== signature) {
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "— Select Sales Person / سیلز پرسن منتخب کریں —";
        select.replaceChildren(placeholder);
        employees.forEach((employee) => {
          const option = document.createElement("option");
          option.value = employee.id;
          option.textContent = employee.name;
          select.appendChild(option);
        });
        select.dataset.employeeSignature = signature;
      }

      if (desiredExists && select.value !== desiredValue) {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          HTMLSelectElement.prototype,
          "value"
        )?.set;
        nativeSetter?.call(select, desiredValue);
        select.dispatchEvent(new Event("change", { bubbles: true }));
        preferredIdRef.current = "";
      } else if (!employees.some((employee) => employee.id === select.value)) {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          HTMLSelectElement.prototype,
          "value"
        )?.set;
        nativeSetter?.call(select, "");
      }

      select.title = "Salespersons come from Employees Master";
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("navilo-salesperson-employees-ready", sync);

    return () => {
      observer.disconnect();
      window.removeEventListener("navilo-salesperson-employees-ready", sync);
    };
  }, [active, pathname]);

  return null;
}
