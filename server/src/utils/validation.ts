export const COLOMBIAN_LOTTERIES = [
  'Lotería de Bogotá',
  'Lotería de Medellín',
  'Lotería del Valle',
  'Lotería de Cundinamarca',
  'Lotería de Boyacá',
  'Lotería del Tolima',
  'Lotería del Huila',
  'Lotería de Santander',
  'Lotería del Cauca',
  'Lotería de Manizales',
  'Lotería de la Cruz Roja',
  'Lotería del Quindío',
  'Lotería del Meta',
  'Chontico',
  'Dorado',
  'Culona',
  'Paisita',
  'Sinuano',
  'Astro',
  'Super Astro',
] as const;

export function normalizeText(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export function isValidTwoDigitNumber(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9]{2}$/.test(value);
}

export function normalizePhone(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const digits = value.replace(/\D/g, '');
  // Permitir +57 o 57 delante si el usuario pegó su número con indicativo
  const clean = digits.length === 12 && digits.startsWith('57') ? digits.slice(2) : digits;
  // Celular colombiano válido: 10 dígitos y empieza en 3
  if (!/^3\d{9}$/.test(clean)) {
    return null;
  }
  return clean;
}

export function isValidDateYmd(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

export function formatCop(amount: number): string {
  return '$' + Math.round(amount).toLocaleString('es-CO');
}

export function csvEscape(value: string | number | null | undefined): string {
  const str = String(value ?? '');
  // Prevenir CSV formula injection en Excel (=, +, -, @, tab, cr)
  const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  return `"${safe.replace(/"/g, '""')}"`;
}
