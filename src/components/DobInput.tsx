'use client';

import { useState } from 'react';

interface Props {
  id?: string;
  name: string;
  required?: boolean;
  className?: string;
}

// Auto-formats MM/DD/YYYY: user types 03141990 → field shows 03/14/1990.
// Strips non-digits, caps at 8 digits, inserts the slashes for you.
export function DobInput({ id, name, required, className }: Props) {
  const [value, setValue] = useState('');

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    let digits = raw.replace(/\D/g, '');
    // If the user just deleted an auto-inserted slash (raw is shorter than
    // current value AND the char that disappeared was a slash), also drop
    // the preceding digit so backspace feels natural.
    const lastOfOld = value[value.length - 1];
    if (raw.length < value.length && lastOfOld === '/') {
      digits = digits.slice(0, -1);
    }
    digits = digits.slice(0, 8);
    let formatted = '';
    if (digits.length < 2) formatted = digits;
    else if (digits.length < 4) formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    else formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    // Append a trailing slash once the segment is complete (so the slash
    // appears AFTER the digit that finished it, not before the next one).
    if (digits.length === 2) formatted = digits + '/';
    else if (digits.length === 4) formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/`;
    setValue(formatted);
  }

  return (
    <input
      id={id}
      name={name}
      type="text"
      required={required}
      inputMode="numeric"
      autoComplete="off"
      placeholder="MM/DD/YYYY"
      value={value}
      onChange={handleChange}
      maxLength={10}
      className={
        className ??
        'w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
      }
    />
  );
}
