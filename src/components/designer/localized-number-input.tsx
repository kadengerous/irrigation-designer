import { useEffect, useState } from "react";
import { formatNumber, parseLocalizedNumber } from "@/lib/i18n";
import { useProject } from "@/lib/project-store";

/** Draft text remains editable (including a decimal comma); commits are finite numbers. */
export function LocalizedNumberInput({ value, onCommit, min, max, digits = 2, ...props }: {
  value: number | null; onCommit: (value: number | null) => void; min?: number; max?: number; digits?: number;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "min" | "max">) {
  const locale = useProject(s => s.locale), numberFormat = useProject(s => s.numberFormat);
  const display = () => value == null ? "" : formatNumber(value, digits);
  const [draft, setDraft] = useState(display);
  useEffect(() => setDraft(display()), [value, locale, numberFormat, digits]);
  const commit = () => {
    if (!draft.trim()) { onCommit(null); return; }
    const next = parseLocalizedNumber(draft);
    if (Number.isFinite(next) && (min == null || next >= min) && (max == null || next <= max)) onCommit(next);
    else setDraft(display());
  };
  return <input {...props} inputMode="decimal" value={draft} onChange={e => setDraft(e.target.value)}
    onBlur={e => { commit(); props.onBlur?.(e); }} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); props.onKeyDown?.(e); }} />;
}
