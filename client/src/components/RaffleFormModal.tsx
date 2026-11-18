import { useState } from 'react';
import { X } from 'lucide-react';
import { ApiError, apiFetch } from '../utils/api';
import { COLOMBIAN_LOTTERIES, TICKET_PRICE_OPTIONS, formatCop } from '../utils/format';

export interface AdminRaffleFormInitial {
  id?: number;
  slug: string;
  name: string;
  description: string;
  drawDate: string;
  prizeText: string;
  lotteryName: string;
  ticketPriceCop: number;
  paymentInstructions: string;
  releaseHours: number;
  status: 'draft' | 'active' | 'closed';
}

interface RaffleFormModalProps {
  initial?: AdminRaffleFormInitial | null;
  onClose: () => void;
  onSaved: (raffleId: number) => void;
}

const OTHER_LOTTERY_VALUE = '__otra__';
const OTHER_PRICE_VALUE = '__otro_precio__';

export function RaffleFormModal({ initial, onClose, onSaved }: RaffleFormModalProps) {
  const isEditing = Boolean(initial?.id);
  const initialIsKnownLottery =
    !initial || COLOMBIAN_LOTTERIES.includes(initial.lotteryName as (typeof COLOMBIAN_LOTTERIES)[number]);
  const initialIsKnownPrice =
    !initial || TICKET_PRICE_OPTIONS.includes(initial.ticketPriceCop);

  const [name, setName] = useState(initial?.name ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [drawDate, setDrawDate] = useState(
    initial?.drawDate ?? new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10)
  );
  const [prizeText, setPrizeText] = useState(initial?.prizeText ?? '');

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
  const [releaseHours, setReleaseHours] = useState(String(initial?.releaseHours ?? 24));
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
    const hours = Number(releaseHours);

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
    if (!Number.isInteger(hours) || hours < 1 || hours > 720) {
      setError('Las horas para liberar números sin pago deben estar entre 1 y 720.');
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
                Horas para liberar sin pago
              </label>
              <input
                type="number"
                min={1}
                max={720}
                required
                value={releaseHours}
                onChange={(e) => setReleaseHours(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
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
