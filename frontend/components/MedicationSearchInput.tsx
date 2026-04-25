"use client";

import { useEffect, useId, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ReferenceResult } from "@/lib/types";

export interface MedicationSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (result: ReferenceResult) => void;
  medicationType: string;
  placeholder?: string;
  disabled?: boolean;
  inputClassName?: string;
}

const DEBOUNCE_MS = 300;
const NO_RESULTS_CLOSE_MS = 2000;

export default function MedicationSearchInput({
  value,
  onChange,
  onSelect,
  medicationType,
  placeholder = "Search or enter a medication name…",
  disabled = false,
  inputClassName = "",
}: MedicationSearchInputProps) {
  const [results, setResults] = useState<ReferenceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [noResults, setNoResults] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const noResultsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      debounceRef.current && clearTimeout(debounceRef.current);
      abortRef.current?.abort();
      noResultsTimerRef.current && clearTimeout(noResultsTimerRef.current);
    };
  }, []);

  const closeDropdown = () => {
    setOpen(false);
    setFocusedIndex(-1);
    setNoResults(false);
    noResultsTimerRef.current && clearTimeout(noResultsTimerRef.current);
  };

  const doSearch = async (q: string, type: string) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    try {
      const params = new URLSearchParams({ q });
      if (type) params.set("type", type);
      const res = await apiFetch(`/api/reference/search?${params}`, {
        signal: abortRef.current.signal,
      });
      if (!res.ok) throw new Error("search failed");
      const data: ReferenceResult[] = await res.json();
      setResults(data);
      setFocusedIndex(-1);
      if (data.length === 0) {
        setNoResults(true);
        setOpen(true);
        noResultsTimerRef.current = setTimeout(closeDropdown, NO_RESULTS_CLOSE_MS);
      } else {
        setNoResults(false);
        setOpen(true);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      // Silent fail — let the user type manually
      closeDropdown();
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    onChange(v);

    debounceRef.current && clearTimeout(debounceRef.current);
    if (v.length < 2) {
      closeDropdown();
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => doSearch(v, medicationType), DEBOUNCE_MS);
  };

  const handleSelect = (result: ReferenceResult) => {
    onChange(result.name);
    onSelect(result);
    closeDropdown();
    setResults([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter" && focusedIndex >= 0) {
      e.preventDefault();
      handleSelect(results[focusedIndex]);
    } else if (e.key === "Escape") {
      closeDropdown();
    }
  };

  const optionId = (i: number) => `${listboxId}-option-${i}`;

  return (
    <div className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={open ? listboxId : undefined}
          aria-activedescendant={focusedIndex >= 0 ? optionId(focusedIndex) : undefined}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={(e) => {
            // Delay to allow click on dropdown item to register
            setTimeout(() => {
              if (!inputRef.current?.contains(document.activeElement)) {
                closeDropdown();
              }
            }, 150);
          }}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          className={inputClassName}
        />
        {loading && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
            <span className="block h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </span>
        )}
      </div>

      {open && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
          style={{ maxHeight: "260px" }}
        >
          {noResults ? (
            <li className="px-4 py-3 text-sm text-gray-400 dark:text-gray-500">
              No matches found — you can still enter the name manually
            </li>
          ) : (
            results.map((r, i) => (
              <li
                key={`${r.source}-${r.rxcui ?? r.name}-${i}`}
                id={optionId(i)}
                role="option"
                aria-selected={i === focusedIndex}
                onMouseDown={(e) => e.preventDefault()} // prevent blur before click
                onClick={() => handleSelect(r)}
                onMouseEnter={() => setFocusedIndex(i)}
                className={`cursor-pointer px-4 py-2.5 ${
                  i === focusedIndex
                    ? "bg-blue-50 dark:bg-blue-900/30"
                    : "hover:bg-gray-50 dark:hover:bg-gray-700/50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {r.display_name}
                  </span>
                  <SourceBadge source={r.source} />
                </div>
                {r.aliases.length > 0 && (
                  <p className="mt-0.5 truncate text-xs text-gray-400 dark:text-gray-500">
                    {r.aliases.slice(0, 2).join(", ")}
                  </p>
                )}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

function SourceBadge({ source }: { source: "rxnorm" | "local" }) {
  if (source === "rxnorm") {
    return (
      <span className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">
        RxNorm
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400">
      Local
    </span>
  );
}
