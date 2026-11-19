import { useState } from 'react';
import { ImagePlus, Trash2, X } from 'lucide-react';
import { ApiError, apiFetch } from '../utils/api';
import {
  COLOMBIAN_LOTTERIES,
  TICKET_PRICE_OPTIONS,
  compressPrizeImageFile,
  formatCop,
  normalizeColombianPhone,
} from '../utils/format';

export interface AdminRaffleFormInitial {
  id?: number;
  slug: string;
  name: string;
  description: string;
  drawDate: string;
  prizeText: string;
  prizeImage?: string;
  organizerName?: string;
  organizerPhone?: string;
  lotteryName: string;
  ticketPriceCop: number;
  paymentInstructions: string;
  releaseHours: number;
  status: 'draft' | 'active' | 'closed';
}

interface RaffleFormModalProps {
  initial?: AdminRaffleFormInitial | null;
  defaultOrganizerName?: string;
  onClose: () => void;
  onSaved: (raffleId: number) => void;
}

const OTHER_LOTTERY_VALUE = '__otra__';
const OTHER_PRICE_VALUE = '__otro_precio__';

export function RaffleFormModal({
  initial,
  defaultOrganizerName = '',
  onClose,
  onSaved,
}: RaffleFormModalProps) {
  const isEditing = Boolean(initial?.id);
  const initialIsKnownLottery =
    !initial || COLOMBIAN_LOTTERIES.includes(initial.lotteryName as (typeof COLOMBIAN_LOTTERIES)[number]);
  const initialIsKnownPrice =
    !initial || TICKET_PRICE_OPTIONS.includes(initial.ticketPriceCop);

  const [name, setName] = useState(initial?.name ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [drawDate, setDrawDate] = useState(
    initial?.drawDate ??
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Bogota',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(Date.now() + 7 * 86400_000))
  );
  const [prizeText, setPrizeText] = useState(initial?.prizeText ?? '');
  const [prizeImage, setPrizeImage] = useState(initial?.prizeImage ?? '');
  const [imageBusy, setImageBusy] = useState(false);
  const [organizerName, setOrganizerName] = useState(
    initial?.organizerName || defaultOrganizerName || ''
  );
  const [organizerPhone, setOrganizerPhone] = useState(initial?.organizerPhone ?? '');

  const [lotteryChoice, setLotteryChoice] = useState(
    initialIsKnownLottery ? initial?.lotteryName ?? COLOMBIAN_LOTTERIES[0] : OTHER_LOTTERY_VALUE
  );
  const [customLottery, setCustomLottery] = useState(
    initialIsKnownLottery ? '' : initial?.lotteryName ?? ''
  );

  const [priceChoice, setPriceChoice] = useState(
    initialIsKnownPrice ? String(initial?.ticketPriceCop ?? 10000) : OTHER_PRICE_VALUE
  );
  const [customPrice, setCustomPrice] = useState(
    initialIsKnownPrice ? '' : String(initial?.ticketPriceCop ?? '')
  );

  const [paymentInstructions, setPaymentInstructions] = useState(
    initial?.paymentInstructions ?? ''
  );
  const [releaseDays, setReleaseDays] = useState(
    String(
      initial?.releaseHours
        ? Math.min(15, Math.max(1, Math.round(initial.releaseHours / 24)))
        : 1
    )
  );
  const [status, setStatus] = useState<'draft' | 'active' | 'closed'>(
    initial?.status ?? 'active'
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const finalLottery =
      lotteryChoice === OTHER_LOTTERY_VALUE ? customLottery.trim() : lotteryChoice;
    const finalPrice =
      priceChoice === OTHER_PRICE_VALUE ? Number(customPrice) : Number(priceChoice);
    const days = Number(releaseDays);
    const hours = days * 24;
    const cleanOrganizerPhone = normalizeColombianPhone(organizerPhone);

    if (name.trim().length < 3) {
      setError('El nombre de la rifa debe tener al menos 3 caracteres.');
      return;
    }
    if (!prizeText.trim() || prizeText.trim().length < 2) {
      setError('Escribe cuál es el premio de la rifa.');
      return;
    }
    if (!finalLottery || finalLottery.length < 2) {
      setError('Selecciona o escribe el nombre de la lotería.');
      return;
    }
    if (!Number.isInteger(finalPrice) || finalPrice < 1000) {
      setError('El valor del puesto debe ser un número entero desde $1.000 COP.');
      return;
    }
    if (!Number.isInteger(days) || days < 1 || days > 15) {
      setError('Los días para liberar números sin pago deben estar entre 1 y 15.');
      return;
    }
    if (organizerName.trim().length < 3) {
      setError('Ingresa el nombre del organizador visible (mínimo 3 caracteres).');
      return;
    }
    if (!cleanOrganizerPhone) {
      setError('Ingresa el WhatsApp del organizador (celular colombiano válido de 10 dígitos, ej: 3001234567).');
      return;
    }
    if (paymentInstructions.trim().length < 5) {
      setError('Escribe las instrucciones de pago (Nequi, Daviplata, cuenta, etc.).');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        slug: slug.trim() || undefined,
        description: description.trim(),
        drawDate,
        prizeText: prizeText.trim(),
        prizeImage,
        organizerName: organizerName.trim(),
        organizerPhone: cleanOrganizerPhone,
        lotteryName: finalLottery,
        ticketPriceCop: finalPrice,
        paymentInstructions: paymentInstructions.trim(),
        releaseHours: hours,
        status,
      };

      const res = await apiFetch<{ raffle: { id: number } }>(
        isEditing ? `/api/admin/raffles/${initial!.id}` : '/api/admin/raffles',
        {
          method: isEditing ? 'PUT' : 'POST',
          body: JSON.stringify(payload),
        }
      );

      onSaved(res.raffle.id);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('No se pudo guardar la rifa.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl bg-white p-5 sm:p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <h2 className="text-xl font-extrabold text-slate-900">
            {isEditing ? 'Editar rifa' : 'Crear nueva rifa'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {error && (
            <div
              role="alert"
              className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-sm font-semibold text-rose-800"
            >
              {error}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-sm font-bold text-slate-800 mb-1">
                Nombre de la rifa <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Gran Rifa Pro-Viaje Octubre"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-bold text-slate-800 mb-1">
                Premio <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                required
                value={prizeText}
                onChange={(e) => setPrizeText(e.target.value)}
                placeholder="Ej: $2.000.000 en efectivo o Moto NMAX 2026"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="mt-1 text-xs text-slate-500">
                Escritura libre: puedes escribir un monto en COP o describir el premio físico.
              </p>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-bold text-slate-800 mb-1">
                Imagen del premio <span className="text-slate-400 font-normal">(opcional)</span>
              </label>

              {prizeImage ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                  <img
                    src={prizeImage}
                    alt="Vista previa del premio"
                    className="w-full sm:w-32 h-32 object-contain rounded-xl bg-white border border-slate-200"
                  />
                  <div className="flex-1 space-y-2">
                    <p className="text-xs font-semibold text-slate-600">
                      Imagen lista para mostrarse en la página pública de la rifa.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <label className="cursor-pointer inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">
                        <ImagePlus className="w-4 h-4" />
                        <span>Cambiar imagen</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif"
                          className="sr-only"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (!file) return;
                            setImageBusy(true);
                            setError('');
                            try {
                              setPrizeImage(await compressPrizeImageFile(file));
                            } catch (err) {
                              setError(err instanceof Error ? err.message : 'Error con la imagen.');
                            } finally {
                              setImageBusy(false);
                            }
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setPrizeImage('')}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 px-3 py-2 text-xs font-bold text-rose-800"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Quitar imagen</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <label className="cursor-pointer flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/40 px-4 py-4 text-sm font-semibold text-slate-600 transition">
                  <ImagePlus className="w-5 h-5 text-indigo-600 shrink-0" />
                  <span>
                    {imageBusy
                      ? 'Optimizando imagen...'
                      : 'Subir foto del premio (PNG, JPG o WebP)'}
                  </span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    disabled={imageBusy}
                    className="sr-only"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file) return;
                      setImageBusy(true);
                      setError('');
                      try {
                        setPrizeImage(await compressPrizeImageFile(file));
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'Error con la imagen.');
                      } finally {
                        setImageBusy(false);
                      }
                    }}
                  />
                </label>
              )}
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-bold text-slate-800 mb-1">
                Descripción <span className="text-slate-400 font-normal">(opcional)</span>
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Detalles adicionales de la rifa, entrega del premio, condiciones..."
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1">
                Fecha del sorteo <span className="text-rose-600">*</span>
              </label>
              <input
                type="date"
                required
                value={drawDate}
                onChange={(e) => setDrawDate(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1">
                Valor del puesto (por número) <span className="text-rose-600">*</span>
              </label>
              <select
                value={priceChoice}
                onChange={(e) => setPriceChoice(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {TICKET_PRICE_OPTIONS.map((amount) => (
                  <option key={amount} value={String(amount)}>
                    {formatCop(amount)} COP
                  </option>
                ))}
                <option value={OTHER_PRICE_VALUE}>Otro valor (escribir)</option>
              </select>
              {priceChoice === OTHER_PRICE_VALUE && (
                <input
                  type="number"
                  min={1000}
                  step={100}
                  required
                  value={customPrice}
                  onChange={(e) => setCustomPrice(e.target.value)}
                  placeholder="Ej: 75000"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              )}
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-bold text-slate-800 mb-1">
                Lotería con la que juega <span className="text-rose-600">*</span>
              </label>
              <select
                value={lotteryChoice}
                onChange={(e) => setLotteryChoice(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {COLOMBIAN_LOTTERIES.map((lot) => (
                  <option key={lot} value={lot}>
                    {lot}
                  </option>
                ))}
                <option value={OTHER_LOTTERY_VALUE}>Otra lotería (escribir nombre)</option>
              </select>
              {lotteryChoice === OTHER_LOTTERY_VALUE && (
                <input
                  type="text"
                  required
                  value={customLottery}
                  onChange={(e) => setCustomLottery(e.target.value)}
                  placeholder="Escribe el nombre de la lotería"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              )}
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1">
                Organizador visible <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                required
                value={organizerName}
                onChange={(e) => setOrganizerName(e.target.value)}
                placeholder="Ej: Juan Pérez o Fundación Esperanza"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1">
                WhatsApp del organizador <span className="text-rose-600">*</span>
              </label>
              <input
                type="tel"
                inputMode="numeric"
                required
                value={organizerPhone}
                onChange={(e) => setOrganizerPhone(e.target.value)}
                placeholder="Ej: 3001234567"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="mt-1 text-xs text-slate-500">
                10 dígitos (para contacto y recibir comprobantes de pago).
              </p>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-bold text-slate-800 mb-1">
                Instrucciones de pago <span className="text-rose-600">*</span>
              </label>
              <textarea
                rows={3}
                required
                value={paymentInstructions}
                onChange={(e) => setPaymentInstructions(e.target.value)}
                placeholder="Ej: Nequi / Daviplata: 300 123 4567 (a nombre de Juan Pérez). Envía el comprobante por WhatsApp."
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1">
                Días para liberar sin pago
              </label>
              <select
                value={releaseDays}
                onChange={(e) => setReleaseDays(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {Array.from({ length: 15 }, (_, idx) => idx + 1).map((day) => (
                  <option key={day} value={String(day)}>
                    {day} {day === 1 ? 'día (24 horas)' : 'días'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1">
                Estado de la rifa
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'draft' | 'active' | 'closed')}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="active">Activa (pública y vendiendo)</option>
                <option value="draft">Borrador (solo visible para ti)</option>
                <option value="closed">Cerrada (no recibe más apartados)</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-bold text-slate-800 mb-1">
                Enlace corto <span className="text-slate-400 font-normal">(opcional)</span>
              </label>
              <div className="flex items-center rounded-xl border border-slate-300 overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500">
                <span className="bg-slate-100 px-3 py-2.5 text-sm text-slate-500 border-r border-slate-300">
                  /r/
                </span>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="se-genera-automaticamente-si-lo-dejas-vacio"
                  className="w-full px-3 py-2.5 text-sm focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-extrabold py-3 px-5 text-base shadow-md transition"
            >
              {submitting ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear rifa'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto rounded-2xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold py-3 px-5 text-sm"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
