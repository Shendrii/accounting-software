export function decimalUnits(value: string, scale = 2) {
  const match = /^(-?)(\d*)(?:\.(\d*))?$/.exec(value);
  if (!match) return BigInt(0);
  const fraction = (match[3] ?? '').padEnd(scale, '0').slice(0, scale);
  return BigInt(match[1] + (match[2] || '0') + fraction);
}

export function decimalText(units: bigint) {
  const sign = units < BigInt(0) ? '-' : '';
  const digits = (sign ? -units : units).toString().padStart(3, '0');
  return sign + digits.slice(0, -2) + '.' + digits.slice(-2);
}

export function formatUsd(amount: string | number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(amount));
}

export function localDay() {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
}

export function journalTotals(lines: { debit: string; credit: string }[]) {
  const totalDebits = lines.reduce((sum, line) => sum + decimalUnits(line.debit), BigInt(0));
  const totalCredits = lines.reduce((sum, line) => sum + decimalUnits(line.credit), BigInt(0));
  const difference = totalDebits >= totalCredits ? totalDebits - totalCredits : totalCredits - totalDebits;
  return { totalDebits, totalCredits, difference };
}
