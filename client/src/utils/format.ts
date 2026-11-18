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

// Valores de puesto de $1.000 en $1.000 COP (hasta $50.000 + valores frecuentes superiores)
export const TICKET_PRICE_OPTIONS: number[] = [
  ...Array.from({ length: 50 }, (_, idx) => (idx + 1) * 1000),
  60000,
  70000,
  80000,
  90000,
  100000,
  150000,
  200000,
  500000,
];

export function formatCop(amount: number): string {
  const rounded = Math.round(Number.isFinite(amount) ? amount : 0);
  return '$' + rounded.toLocaleString('es-CO');
}

export function formatDateCo(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return date.toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatDateTimeCo(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function normalizeColombianPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  const clean = digits.length === 12 && digits.startsWith('57') ? digits.slice(2) : digits;
  return /^3\d{9}$/.test(clean) ? clean : null;
}

export function buildWhatsAppDirectUrl(phone10: string, message: string): string {
  const digits = phone10.replace(/\D/g, '');
  const full = digits.length === 10 ? `57${digits}` : digits;
  return `https://wa.me/${full}?text=${encodeURIComponent(message)}`;
}

export function buildWhatsAppShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function buildPaymentConfirmedWhatsAppMessage(params: {
  buyerName: string;
  raffleName: string;
  numbers: string[];
  prizeText: string;
  drawDate: string;
  lotteryName: string;
}): string {
  const numsText = params.numbers.join(', ');
  const plural = params.numbers.length === 1 ? 'tu número' : 'tus números';
  return (
    `¡Hola ${params.buyerName}! ✅ Hemos recibido y confirmado tu pago para la rifa *${params.raffleName}*.\n\n` +
    `🎟️ *${plural === 'tu número' ? 'Número comprado' : 'Números comprados'}:* ${numsText}\n` +
    `🏆 *Premio:* ${params.prizeText}\n` +
    `📅 *Fecha del sorteo:* ${formatDateCo(params.drawDate)} (${params.lotteryName})\n\n` +
    `¡Gracias por participar y mucha suerte en el sorteo! 🍀🎉`
  );
}

export function buildPaymentReminderWhatsAppMessage(params: {
  buyerName: string;
  raffleName: string;
  numbers: string[];
  totalCop: number;
  paymentInstructions: string;
}): string {
  return (
    `¡Hola ${params.buyerName}! 👋 Te recordamos que tienes apartado(s) el/los número(s) *${params.numbers.join(', ')}* en la rifa *${params.raffleName}*.\n\n` +
    `💰 *Total a pagar:* ${formatCop(params.totalCop)}\n` +
    `💳 *Instrucciones de pago:*\n${params.paymentInstructions}\n\n` +
    `Cuando realices el pago, envíanos el comprobante por aquí para confirmarlo. ¡Gracias!`
  );
}

const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
const MAX_IMAGE_DATA_URL_LENGTH = 700_000;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('No se pudo leer la imagen.'));
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo seleccionado.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo procesar la imagen seleccionada.'));
    img.src = src;
  });
}

export async function compressPrizeImageFile(file: File): Promise<string> {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new Error('Formato no compatible. Usa una imagen PNG, JPG, WebP o GIF.');
  }

  const rawDataUrl = await readFileAsDataUrl(file);
  if (file.type === 'image/gif' && rawDataUrl.length <= MAX_IMAGE_DATA_URL_LENGTH) {
    return rawDataUrl;
  }

  const img = await loadImage(rawDataUrl);
  const maxDim = 960;
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Tu navegador no pudo procesar la imagen.');
  }
  ctx.drawImage(img, 0, 0, width, height);

  let out = canvas.toDataURL('image/webp', 0.82);
  if (!out.startsWith('data:image/webp') || out.length > MAX_IMAGE_DATA_URL_LENGTH) {
    out = canvas.toDataURL('image/jpeg', 0.82);
  }
  if (out.length > MAX_IMAGE_DATA_URL_LENGTH) {
    out = canvas.toDataURL('image/jpeg', 0.65);
  }
  if (out.length > MAX_IMAGE_DATA_URL_LENGTH) {
    throw new Error('La imagen sigue siendo muy pesada. Prueba con otra imagen más pequeña.');
  }
  return out;
}
