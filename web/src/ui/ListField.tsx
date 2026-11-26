import React, { useEffect, useRef, useState } from "react";

/**
 * ListField — a controlled input/textarea for editing a string[] as delimited
 * text ("one per line" textareas, comma-separated inputs).
 *
 * Why this exists: the naive pattern `value={list.join(sep)}` + onChange-split
 * makes separators impossible to type — Enter yields "a\n", which parses to
 * ["a"], which re-renders as "a", so the newline is killed on the keystroke
 * (same for trailing commas). ListField keeps the raw text as its source of
 * truth while focused — separators survive mid-edit — and normalizes
 * (split/trim/drop empties) into the parent's list on every keystroke and on
 * blur. External list changes (draft restore, resets) are adopted whenever
 * the raw text doesn't already parse to them, so typing is never fought.
 */

const parse = (raw: string, separator: string): string[] =>
  raw
    .split(separator)
    .map((s) => s.trim())
    .filter(Boolean);

export function ListField(props: {
  value: string[];
  onChange: (next: string[]) => void;
  /** "\n" for one-per-line textareas, "," for comma-separated inputs. */
  separator: "\n" | ",";
  /** Render a textarea (newlines) instead of a single-line input. */
  multiline?: boolean;
  style?: React.CSSProperties;
  placeholder?: string;
  ariaLabel?: string;
}): React.JSX.Element {
  const { value, onChange, separator, multiline = false, style, placeholder, ariaLabel } = props;
  const [raw, setRaw] = useState(() => value.join(separator));
  const focused = useRef(false);

  // Adopt external changes only when they differ from what our raw text
  // already says — comparing parsed forms (not raw strings) keeps in-flight
  // separators like "a\n" or "a," stable while the user types.
  useEffect(() => {
    if (!focused.current && parse(raw, separator).join(separator) !== value.join(separator)) {
      setRaw(value.join(separator));
    }
  });

  const commit = (text: string) => {
    setRaw(text);
    onChange(parse(text, separator));
  };

  const shared = {
    style,
    placeholder,
    "aria-label": ariaLabel,
    value: raw,
    onFocus: () => {
      focused.current = true;
    },
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => commit(e.target.value),
    onBlur: () => {
      focused.current = false;
      commit(parse(raw, separator).join(separator));
    },
  } as const;

  return multiline ? <textarea {...shared} /> : <input {...shared} />;
}
