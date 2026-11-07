'use client';

import { useState, useEffect, useId, useMemo, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { DIAL_CODE_OPTIONS } from '@/lib/countries';
import { cn } from '@/lib/utils';

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
  /** Optional country to auto-select the matching dial code */
  country?: string;
}

/**
 * Parses a combined phone string like "+63 917 123 4567" into
 * { dialCode: "+63", number: "917 123 4567" }
 */
function parse(combined: string): { dialCode: string; number: string } {
  if (!combined) return { dialCode: '', number: '' };
  const match = combined.match(/^(\+\d{1,4})\s*(.*)$/);
  if (match) return { dialCode: match[1], number: match[2] };
  return { dialCode: '', number: combined };
}

function countryToFlag(country: string): string {
  const flags: Record<string, string> = {
    Afghanistan: '🇦🇫',
    Albania: '🇦🇱',
    Algeria: '🇩🇿',
    Andorra: '🇦🇩',
    Angola: '🇦🇴',
    Argentina: '🇦🇷',
    Armenia: '🇦🇲',
    Australia: '🇦🇺',
    Austria: '🇦🇹',
    Azerbaijan: '🇦🇿',
    Bahamas: '🇧🇸',
    Bahrain: '🇧🇭',
    Bangladesh: '🇧🇩',
    Belarus: '🇧🇾',
    Belgium: '🇧🇪',
    Belize: '🇧🇿',
    Benin: '🇧🇯',
    Bhutan: '🇧🇹',
    Bolivia: '🇧🇴',
    'Bosnia and Herzegovina': '🇧🇦',
    Botswana: '🇧🇼',
    Brazil: '🇧🇷',
    Brunei: '🇧🇳',
    Bulgaria: '🇧🇬',
    'Burkina Faso': '🇧🇫',
    Burundi: '🇧🇮',
    Cambodia: '🇰🇭',
    Cameroon: '🇨🇲',
    Canada: '🇨🇦',
    Chad: '🇹🇩',
    Chile: '🇨🇱',
    China: '🇨🇳',
    Colombia: '🇨🇴',
    Congo: '🇨🇬',
    'Costa Rica': '🇨🇷',
    Croatia: '🇭🇷',
    Cuba: '🇨🇺',
    Cyprus: '🇨🇾',
    'Czech Republic': '🇨🇿',
    Denmark: '🇩🇰',
    'Dominican Republic': '🇩🇴',
    Ecuador: '🇪🇨',
    Egypt: '🇪🇬',
    'El Salvador': '🇸🇻',
    Estonia: '🇪🇪',
    Ethiopia: '🇪🇹',
    Finland: '🇫🇮',
    France: '🇫🇷',
    Georgia: '🇬🇪',
    Germany: '🇩🇪',
    Ghana: '🇬🇭',
    Greece: '🇬🇷',
    Guatemala: '🇬🇹',
    Guinea: '🇬🇳',
    Haiti: '🇭🇹',
    Honduras: '🇭🇳',
    Hungary: '🇭🇺',
    Iceland: '🇮🇸',
    India: '🇮🇳',
    Indonesia: '🇮🇩',
    Iran: '🇮🇷',
    Iraq: '🇮🇶',
    Ireland: '🇮🇪',
    Israel: '🇮🇱',
    Italy: '🇮🇹',
    Jamaica: '🇯🇲',
    Japan: '🇯🇵',
    Jordan: '🇯🇴',
    Kazakhstan: '🇰🇿',
    Kenya: '🇰🇪',
    Kosovo: '🇽🇰',
    Kuwait: '🇰🇼',
    Kyrgyzstan: '🇰🇬',
    Laos: '🇱🇦',
    Latvia: '🇱🇻',
    Lebanon: '🇱🇧',
    Libya: '🇱🇾',
    Liechtenstein: '🇱🇮',
    Lithuania: '🇱🇹',
    Luxembourg: '🇱🇺',
    Madagascar: '🇲🇬',
    Malaysia: '🇲🇾',
    Maldives: '🇲🇻',
    Mali: '🇲🇱',
    Malta: '🇲🇹',
    Mexico: '🇲🇽',
    Moldova: '🇲🇩',
    Monaco: '🇲🇨',
    Mongolia: '🇲🇳',
    Montenegro: '🇲🇪',
    Morocco: '🇲🇦',
    Mozambique: '🇲🇿',
    Myanmar: '🇲🇲',
    Namibia: '🇳🇦',
    Nepal: '🇳🇵',
    Netherlands: '🇳🇱',
    'New Zealand': '🇳🇿',
    Nicaragua: '🇳🇮',
    Niger: '🇳🇪',
    Nigeria: '🇳🇬',
    'North Korea': '🇰🇵',
    'North Macedonia': '🇲🇰',
    Norway: '🇳🇴',
    Oman: '🇴🇲',
    Pakistan: '🇵🇰',
    Panama: '🇵🇦',
    'Papua New Guinea': '🇵🇬',
    Paraguay: '🇵🇾',
    Peru: '🇵🇪',
    Philippines: '🇵🇭',
    Poland: '🇵🇱',
    Portugal: '🇵🇹',
    Qatar: '🇶🇦',
    Romania: '🇷🇴',
    Russia: '🇷🇺',
    Rwanda: '🇷🇼',
    'Saudi Arabia': '🇸🇦',
    Senegal: '🇸🇳',
    Serbia: '🇷🇸',
    Singapore: '🇸🇬',
    Slovakia: '🇸🇰',
    Slovenia: '🇸🇮',
    Somalia: '🇸🇴',
    'South Africa': '🇿🇦',
    'South Korea': '🇰🇷',
    'South Sudan': '🇸🇸',
    Spain: '🇪🇸',
    'Sri Lanka': '🇱🇰',
    Sudan: '🇸🇩',
    Sweden: '🇸🇪',
    Switzerland: '🇨🇭',
    Syria: '🇸🇾',
    Taiwan: '🇹🇼',
    Tajikistan: '🇹🇯',
    Tanzania: '🇹🇿',
    Thailand: '🇹🇭',
    'Timor-Leste': '🇹🇱',
    Togo: '🇹🇬',
    'Trinidad and Tobago': '🇹🇹',
    Tunisia: '🇹🇳',
    Turkey: '🇹🇷',
    Turkmenistan: '🇹🇲',
    Uganda: '🇺🇬',
    Ukraine: '🇺🇦',
    'United Arab Emirates': '🇦🇪',
    'United Kingdom': '🇬🇧',
    'United States': '🇺🇸',
    Uruguay: '🇺🇾',
    Uzbekistan: '🇺🇿',
    Venezuela: '🇻🇪',
    Vietnam: '🇻🇳',
    Yemen: '🇾🇪',
    Zambia: '🇿🇲',
    Zimbabwe: '🇿🇼',
  };

  return flags[country] ?? '🌐';
}

export default function PhoneInput({ value, onChange, disabled, id, country }: PhoneInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const pickerRef = useRef<HTMLDivElement>(null);

  const initial = parse(value);
  const [dialCode, setDialCode] = useState(initial.dialCode || '');
  const [selectedCountry, setSelectedCountry] = useState(
    DIAL_CODE_OPTIONS.find((o) => o.code === initial.dialCode && o.country === country)?.country
      ?? DIAL_CODE_OPTIONS.find((o) => o.code === initial.dialCode)?.country ?? ''
  );
  const [number, setNumber] = useState(initial.number);
  const [previousValue, setPreviousValue] = useState(value);
  const [previousCountry, setPreviousCountry] = useState(country);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selectedOption = useMemo(
    () => DIAL_CODE_OPTIONS.find((o) => o.country === selectedCountry),
    [selectedCountry]
  );
  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return DIAL_CODE_OPTIONS;
    return DIAL_CODE_OPTIONS.filter(
      (o) => o.country.toLowerCase().includes(q) || o.code.toLowerCase().includes(q)
    );
  }, [query]);

  // Apply external changes before painting stale local phone fields.
  if (country !== previousCountry) {
    setPreviousCountry(country);
    const match = DIAL_CODE_OPTIONS.find((o) => o.country === country);
    if (match) {
      setSelectedCountry(match.country);
      setDialCode(match.code);
    }
  }
  if (value !== previousValue) {
    setPreviousValue(value);
    const parsed = parse(value);
    setDialCode(parsed.dialCode);
    setSelectedCountry((current) => {
      if (DIAL_CODE_OPTIONS.find((o) => o.country === current)?.code === parsed.dialCode) return current;
      return DIAL_CODE_OPTIONS.find((o) => o.code === parsed.dialCode)?.country ?? '';
    });
    setNumber(parsed.number);
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!pickerRef.current?.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function emit(code: string, num: string) {
    const combined = code && num ? `${code} ${num}` : num || code || '';
    onChange(combined.trim());
  }

  function handleNumberChange(e: React.ChangeEvent<HTMLInputElement>) {
    setNumber(e.target.value);
    emit(dialCode, e.target.value);
  }

  function selectCountry(optionCountry: string) {
    const option = DIAL_CODE_OPTIONS.find((o) => o.country === optionCountry);
    const nextCode = option?.code ?? '';
    setSelectedCountry(optionCountry);
    setDialCode(nextCode);
    emit(nextCode, number);
    setIsOpen(false);
    setQuery('');
  }

  return (
    <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-visible focus-within:ring-2 focus-within:ring-zinc-400">
      {/* Dial code picker */}
      <div ref={pickerRef} className="relative shrink-0 border-r border-zinc-200 dark:border-zinc-700">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setIsOpen((s) => !s)}
          className={cn(
            'h-full min-w-[6.5rem] px-2 py-2 bg-zinc-50 dark:bg-zinc-800 text-sm',
            'text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5 justify-between',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
          aria-label="Select country dial code"
          aria-expanded={isOpen}
        >
          <span className="truncate">
            {selectedOption ? `${countryToFlag(selectedOption.country)} ${selectedOption.code}` : 'Code'}
          </span>
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', isOpen && 'rotate-180')} />
        </button>

        {isOpen && (
          <div className="absolute left-0 top-[calc(100%+4px)] z-50 w-72 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg">
            <div className="p-2 border-b border-zinc-100 dark:border-zinc-800">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search country or code"
                className="w-full px-2.5 py-2 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-400"
              />
            </div>
            <div className="max-h-64 overflow-y-auto py-1">
              {filteredOptions.map((o) => (
                <button
                  key={`${o.country}-${o.code}`}
                  type="button"
                  onClick={() => selectCountry(o.country)}
                  className={cn(
                    'w-full text-left px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800',
                    selectedCountry === o.country
                      ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50'
                      : 'text-zinc-700 dark:text-zinc-300'
                  )}
                >
                  {countryToFlag(o.country)} {o.country} ({o.code})
                </button>
              ))}
              {filteredOptions.length === 0 && (
                <p className="px-3 py-2 text-sm text-zinc-400">No country found.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Phone number */}
      <input
        id={inputId}
        type="tel"
        value={number}
        onChange={handleNumberChange}
        disabled={disabled}
        placeholder="Phone number"
        className="flex-1 min-w-0 px-3 py-2 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-50 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
      />
    </div>
  );
}
