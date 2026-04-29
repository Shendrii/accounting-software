'use client';

import { useState, useRef, useEffect, useId, KeyboardEvent } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ComboBoxProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Allow any free-text value even if not in options list */
  allowFreeText?: boolean;
  className?: string;
  id?: string;
}

export default function ComboBox({
  options,
  value,
  onChange,
  placeholder = 'Select or type…',
  disabled = false,
  allowFreeText = true,
  className,
  id,
}: ComboBoxProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Keep query in sync when value changes externally (e.g. form reset)
  useEffect(() => {
    setQuery(value);
  }, [value]);

  const filtered = query.trim()
    ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase()))
    : options;

  function select(option: string) {
    setQuery(option);
    onChange(option);
    setOpen(false);
    setHighlighted(0);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setQuery(v);
    setOpen(true);
    setHighlighted(0);
    if (allowFreeText) onChange(v);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlighted]) select(filtered[highlighted]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  function handleBlur(e: React.FocusEvent) {
    // Only close if focus moves outside the container
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      setOpen(false);
      // If free text not allowed and typed value not in options, reset
      if (!allowFreeText && !options.includes(query)) {
        setQuery(value);
      }
    }
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    setQuery('');
    onChange('');
    setOpen(false);
  }

  // Scroll highlighted item into view
  useEffect(() => {
    if (open && listRef.current) {
      const item = listRef.current.children[highlighted] as HTMLElement | undefined;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlighted, open]);

  return (
    <div
      ref={containerRef}
      className={cn('relative', className)}
      onBlur={handleBlur}
    >
      <div className="relative">
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={`${inputId}-list`}
          autoComplete="off"
          disabled={disabled}
          value={query}
          onChange={handleInputChange}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full pl-3 pr-8 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-400 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
          {query && !disabled && (
            <button
              type="button"
              tabIndex={-1}
              onClick={clear}
              className="p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 rounded"
              aria-label="Clear"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <ChevronDown
            className={cn(
              'h-4 w-4 text-zinc-400 transition-transform duration-150 pointer-events-none',
              open && 'rotate-180'
            )}
          />
        </div>
      </div>

      {open && filtered.length > 0 && (
        <ul
          id={`${inputId}-list`}
          ref={listRef}
          role="listbox"
          className="absolute z-50 mt-1 w-full max-h-52 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg py-1 text-sm"
        >
          {filtered.map((option, i) => (
            <li
              key={option}
              role="option"
              aria-selected={option === value}
              onMouseDown={(e) => { e.preventDefault(); select(option); }}
              onMouseEnter={() => setHighlighted(i)}
              className={cn(
                'px-3 py-2 cursor-pointer select-none',
                i === highlighted
                  ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50'
                  : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/60',
                option === value && 'font-medium'
              )}
            >
              {option}
            </li>
          ))}
        </ul>
      )}

      {open && filtered.length === 0 && query && !allowFreeText && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg px-3 py-2 text-sm text-zinc-400">
          No matches
        </div>
      )}
    </div>
  );
}
