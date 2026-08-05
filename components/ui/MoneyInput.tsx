'use client';
import { useEffect, useRef, useState } from 'react';

interface Props {
  value: number;
  onChange: (v: number) => void;
  className?: string;
  placeholder?: string;
  min?: number;
  max?: number;
}

// Converte número JS para string BR (vírgula como decimal, sem zeros desnecessários)
function toDisplay(v: number): string {
  if (!v) return '';
  return v.toFixed(2).replace('.', ',').replace(/,?0+$/, '');
}

// Aceita tanto "1.500,50" quanto "1500.50" quanto "1500,5"
function parseBR(s: string): number {
  let clean = s;
  if (s.includes(',')) {
    // Tem vírgula → vírgula é decimal; pontos são separadores de milhar
    clean = s.replace(/\./g, '').replace(',', '.');
  }
  return parseFloat(clean) || 0;
}

export function MoneyInput({ value, onChange, className, placeholder, min, max }: Props) {
  const [raw, setRaw] = useState(() => toDisplay(value));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) {
      setRaw(toDisplay(value));
    }
  }, [value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={raw}
      placeholder={placeholder}
      className={className}
      onFocus={(e) => {
        focusedRef.current = true;
        e.target.select();
      }}
      onBlur={() => {
        focusedRef.current = false;
        const parsed = parseBR(raw);
        const clamped =
          min != null && parsed < min ? min
          : max != null && parsed > max ? max
          : parsed;
        setRaw(toDisplay(clamped));
        onChange(clamped);
      }}
      onChange={(e) => {
        const filtered = e.target.value.replace(/[^\d,\.]/g, '');
        setRaw(filtered);
        onChange(parseBR(filtered));
      }}
    />
  );
}
