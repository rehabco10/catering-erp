// A one-line Select for the ~10 places that just need "pick one of these".
//
// The Base UI Select is a Root/Trigger/Value/Content/Item tree; spelling that
// out at every call site buried the actual choice in markup and drifted (one
// place had a placeholder, another didn't). This wraps it once: pass options,
// get a select. Anything needing groups or custom item rendering still uses the
// primitives directly.
//
// IMPORTANT — why `<SelectValue>` takes a function here:
// Base UI's Select.Value renders the raw *value*, not the selected item's
// children. With value/label pairs like `{ value: "published", label: "معروض" }`
// that means the trigger shows `published` while the list shows «معروض» — which
// is exactly what shipped to /offers and read as an untranslated label. The
// formatter maps the value back through `options`, so the trigger and the list
// can never disagree.
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type SelectOption = { value: string; label: string };

export function SelectField({
  value, onChange, options, placeholder = "— اختر —", id, disabled, invalid,
  className, allowEmpty = true, emptyLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  /** offer a "no choice" row — filters need it, required fields don't */
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  const labelFor = (v: unknown): string => {
    if (v == null || v === "") return emptyLabel ?? placeholder;
    const hit = options.find((o) => o.value === String(v));
    // fall back to the raw value only when the option list genuinely lacks it
    // (a stale URL param, say) — better a visible oddity than a blank trigger
    return hit?.label ?? String(v);
  };

  // Base UI treats null as "nothing selected"; "" would be a real value and the
  // placeholder would never show
  return (
    <Select
      value={value === "" ? null : value}
      onValueChange={(next) => onChange(next == null ? "" : String(next))}
      disabled={disabled}
    >
      <SelectTrigger id={id} aria-invalid={invalid} className={cn("w-full", className)}>
        <SelectValue>{(v) => labelFor(v)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {allowEmpty && (
          <SelectItem value={null as unknown as string}>
            {emptyLabel ?? placeholder}
          </SelectItem>
        )}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
