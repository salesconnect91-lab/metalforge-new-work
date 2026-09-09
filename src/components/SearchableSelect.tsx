import { Children, Fragment, isValidElement, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactElement, type ReactNode, type SelectHTMLAttributes } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

type FlatOption = {
  value: string;
  label: string;
  disabled: boolean;
  group?: string;
};

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  children: ReactNode;
  searchPlaceholder?: string;
  emptyText?: string;
};

function flattenOptions(children: ReactNode, group?: string): FlatOption[] {
  const out: FlatOption[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const element = child as ReactElement<any>;
    if (element.type === Fragment) {
      out.push(...flattenOptions(element.props.children, group));
      return;
    }
    if (element.type === "optgroup") {
      out.push(...flattenOptions(element.props.children, String(element.props.label ?? "")));
      return;
    }
    if (element.type === "option") {
      const raw = element.props.value ?? element.props.children ?? "";
      const label = Children.toArray(element.props.children).join("").trim();
      out.push({ value: String(raw), label, disabled: Boolean(element.props.disabled), group });
      return;
    }
    if (element.props?.children) out.push(...flattenOptions(element.props.children, group));
  });
  return out;
}

export default function SearchableSelect({
  children,
  value,
  defaultValue,
  onChange,
  disabled,
  className = "",
  searchPlaceholder = "Type to search...",
  emptyText = "No matching option",
  multiple,
  size,
  ...rest
}: Props) {
  if (multiple || (typeof size === "number" && size > 1)) {
    return <select {...rest} multiple={multiple} size={size} value={value} defaultValue={defaultValue} onChange={onChange} disabled={disabled} className={className}>{children}</select>;
  }

  const options = useMemo(() => flattenOptions(children), [children]);
  const controlledValue = value == null ? undefined : String(value);
  const initialValue = controlledValue ?? (defaultValue == null ? "" : String(defaultValue));
  const [internalValue, setInternalValue] = useState(initialValue);
  const selectedValue = controlledValue ?? internalValue;
  const selected = options.find((option) => option.value === selectedValue) ?? options.find((option) => option.value === "");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectRef = useRef<HTMLSelectElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (controlledValue !== undefined) setInternalValue(controlledValue);
  }, [controlledValue]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    const visible = options.filter((option) => option.value !== "" || !q).filter((option) => {
      if (!q) return true;
      return `${option.label} ${option.group ?? ""}`.toLocaleLowerCase().includes(q);
    });
    return visible.slice(0, 300);
  }, [options, query]);

  const commit = (nextValue: string) => {
    const option = options.find((candidate) => candidate.value === nextValue);
    if (option?.disabled || disabled) return;
    if (controlledValue === undefined) setInternalValue(nextValue);
    const source = selectRef.current;
    if (source) {
      source.value = nextValue;
      if (onChange) {
        const eventLike = {
          target: source,
          currentTarget: source,
          type: "change",
          bubbles: true,
          cancelable: false,
          defaultPrevented: false,
          eventPhase: 3,
          isTrusted: true,
          nativeEvent: new Event("change", { bubbles: true }),
          preventDefault() {},
          isDefaultPrevented: () => false,
          stopPropagation() {},
          isPropagationStopped: () => false,
          persist() {},
          timeStamp: Date.now(),
        } as unknown as ChangeEvent<HTMLSelectElement>;
        onChange(eventLike);
      }
    }
    setOpen(false);
    setQuery("");
  };

  const openMenu = () => {
    if (disabled) return;
    setOpen(true);
    setQuery("");
    const currentIndex = filtered.findIndex((option) => option.value === selectedValue && !option.disabled);
    setActiveIndex(currentIndex >= 0 ? currentIndex : Math.max(0, filtered.findIndex((option) => !option.disabled)));
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      setQuery("");
      return;
    }
    if (!filtered.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      let next = activeIndex;
      for (let i = 0; i < filtered.length; i += 1) {
        next = (next + direction + filtered.length) % filtered.length;
        if (!filtered[next]?.disabled) break;
      }
      setActiveIndex(next);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const option = filtered[activeIndex];
      if (option && !option.disabled) commit(option.value);
    }
  };

  const placeholderOption = options.find((option) => option.value === "");
  const displayLabel = selected?.label || placeholderOption?.label || "Select...";

  return (
    <div ref={rootRef} className="relative min-w-0 w-full">
      <select
        {...rest}
        ref={selectRef}
        value={selectedValue}
        onChange={onChange}
        disabled={disabled}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      >
        {children}
      </select>

      <button
        type="button"
        disabled={disabled}
        onClick={openMenu}
        className={`${className} flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`min-w-0 flex-1 truncate ${selectedValue ? "text-slate-900" : "text-slate-500"}`}>{displayLabel}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-[100] mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 p-2">
            <div className="flex h-8 items-center gap-2 rounded-md border border-slate-300 bg-white px-2 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
              <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }}
                onKeyDown={handleKeyDown}
                placeholder={searchPlaceholder}
                className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-slate-900 outline-none placeholder:text-slate-400"
                autoComplete="off"
              />
            </div>
          </div>
          <div role="listbox" className="max-h-72 overflow-auto p-1">
            {!filtered.length ? (
              <div className="px-3 py-5 text-center text-[12px] text-slate-500">{emptyText}</div>
            ) : filtered.map((option, index) => (
              <button
                key={`${option.group ?? ""}:${option.value}:${index}`}
                type="button"
                role="option"
                aria-selected={option.value === selectedValue}
                disabled={option.disabled}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => commit(option.value)}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] ${index === activeIndex ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-50"} disabled:cursor-not-allowed disabled:opacity-40`}
              >
                <span className="min-w-0 flex-1">
                  {option.group && <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{option.group} ·</span>}
                  <span className="break-words">{option.label}</span>
                </span>
                {option.value === selectedValue && <Check className="h-3.5 w-3.5 shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
