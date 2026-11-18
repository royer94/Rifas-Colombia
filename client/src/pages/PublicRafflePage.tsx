import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertCircle,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Gift,
  RefreshCw,
  Share2,
  Ticket,
  Trophy,
  X,
} from 'lucide-react';
import { GridNumberItem, NumberGrid, NumberLegend } from '../components/NumberGrid';
import { ApiError, apiFetch } from '../utils/api';
import {
  buildWhatsAppShareUrl,
  formatCop,
  formatDateCo,
  formatDateTimeCo,
  normalizeColombianPhone,
} from '../utils/format';

interface PublicRaffleResponse {
  raffle: {
    id: number;
    slug: string;
    name: string;
    description: string;
    drawDate: string;
    prizeText: string;
    lotteryName: string;
    ticketPriceCop: number;
    paymentInstructions: string;
    releaseHours: number;
    status: 'active' | 'closed';
    winningNumber: string | null;
    winnerName: string | null;
    winnerStatus: 'paid' | 'pending' | 'unclaimed' | null;
  };
  numbers: GridNumberItem[];
  counts: {
    available: number;
    pending: number;
    paid: number;
  };
  serverTime: string;
}

interface ReservationConfirmation {
  raffleName: string;
  raffleSlug: string;
  drawDate: string;
  prizeText: string;
  lotteryName: string;
  numbers: string[];
  ticketPriceCop: number;
  totalCop: number;
  releaseHours: number;
  expiresAt: string;
  paymentInstructions: string;
  buyerName: string;
  buyerPhone: string;
}

export function PublicRafflePage() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<PublicRaffleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [confirmation, setConfirmation] = useState<ReservationConfirmation | null>(null);
  const [copiedInstructions, setCopiedInstructions] = useState(false);
  const [boardNotice, setBoardNotice] = useState('');

  const selectedRef = useRef<string[]>([]);
  selectedRef.current = selected;

  const fetchBoard = useCallback(
    async (silent = false) => {
      if (!slug) return;
      if (!silent) setLoading(true);
      try {
        const res = await apiFetch<PublicRaffleResponse>(`/api/public/raffles/${slug}`);
        setData(res);
        setError('');

        // Si algún número que el visitante estaba eligiendo fue tomado por otro usuario, deseleccionarlo y avisar
        const availableSet = new Set(
          res.numbers.filter((n) => n.status === 'available').map((n) => n.number)
        );
        const removed = selectedRef.current.filter((n) => !availableSet.has(n));
        if (removed.length > 0) {
          setSelected((prev) => prev.filter((n) => availableSet.has(n)));
          setBoardNotice(
            removed.length === 1
              ? `El número ${removed[0]} acaba de ser tomado por otra persona.`
              : `Los números ${removed.join(', ')} acaban de ser tomados por otras personas.`
          );
        }
      } catch (err) {
        if (!silent) {
          setError(err instanceof Error ? err.message : 'No pudimos cargar esta rifa.');
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [slug]
  );

  useEffect(() => {
    fetchBoard(false);
    const interval = window.setInterval(() => {
      fetchBoard(true);
    }, 4000);

    const onFocus = () => fetchBoard(true);
    window.addEventListener('focus', onFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [fetchBoard]);

  const handleToggleNumber = (item: GridNumberItem) => {
    if (!data || data.raffle.status !== 'active' || item.status !== 'available') return;
    setBoardNotice('');
    setSelected((prev) =>
      prev.includes(item.number)
        ? prev.filter((n) => n !== item.number)
        : [...prev, item.number].sort()
    );
  };

  const totalCop = useMemo(() => {
    if (!data) return 0;
    return selected.length * data.raffle.ticketPriceCop;
  }, [data, selected.length]);

  const handleSubmitReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug || !data) return;

    const cleanName = fullName.trim();
    const cleanPhone = normalizeColombianPhone(phone);

    if (cleanName.length < 3) {
      setFormError('Escribe tu nombre completo (mínimo 3 caracteres).');
      return;
    }
    if (!cleanPhone) {
      setFormError('Ingresa un celular o WhatsApp colombiano válido de 10 dígitos (ej: 3001234567).');
      return;
    }
    if (selected.length === 0) {
      setFormError('Selecciona al menos un número disponible.');
      return;
    }

    setFormError('');
    setSubmitting(true);

    try {
      const res = await apiFetch<{ reservation: ReservationConfirmation }>(
        `/api/public/raffles/${slug}/reserve`,
        {
          method: 'POST',
          body: JSON.stringify({
            numbers: selected,
            fullName: cleanName,
            phone: cleanPhone,
            address: address.trim(),
          }),
        }
      );

      setConfirmation(res.reservation);
      setShowModal(false);
      setSelected([]);
      setFullName('');
      setPhone('');
      setAddress('');
      await fetchBoard(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const taken = Array.isArray(err.data.takenNumbers)
          ? (err.data.takenNumbers as string[])
          : [];
        setFormError(err.message);
        setBoardNotice(err.message);
        if (taken.length > 0) {
          setSelected((prev) => prev.filter((n) => !taken.includes(n)));
        }
        await fetchBoard(true);
      } else {
        setFormError(err instanceof Error ? err.message : 'Error al apartar los números.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyInstructions = async () => {
    if (!confirmation) return;
    try {
      await navigator.clipboard.writeText(confirmation.paymentInstructions);
      setCopiedInstructions(true);
      setTimeout(() => setCopiedInstructions(false), 2500);
    } catch {
      // Fallback silencioso
    }
  };

  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
  const whatsappShareUrl = data
    ? buildWhatsAppShareUrl(
        `¡Participa en la rifa "${data.raffle.name}"! 🏆 Premio: ${data.raffle.prizeText}. Valor del número: ${formatCop(data.raffle.ticketPriceCop)}. Elige tus números aquí: ${shareUrl}`
      )
    : '#';

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3 text-slate-600">
          <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
          <p className="font-semibold">Cargando tablero de la rifa...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-2xl bg-white border border-slate-200 p-6 text-center shadow-sm">
          <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
          <h1 className="mt-3 text-xl font-bold text-slate-900">Rifa no disponible</h1>
          <p className="mt-2 text-sm text-slate-600">{error || 'No pudimos encontrar esta rifa.'}</p>
          <Link
            to="/"
            className="mt-5 inline-flex items-center justify-center rounded-xl bg-indigo-600 text-white px-4 py-2.5 text-sm font-bold hover:bg-indigo-700"
          >
            Ver otras rifas
          </Link>
        </div>
      </div>
    );
  }

  const { raffle, numbers, counts } = data;
  const isClosed = raffle.status === 'closed';

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      {/* Barra superior compacta */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 py-2.5 flex items-center justify-between gap-2">
          <Link to="/" className="inline-flex items-center gap-2 text-slate-800 font-bold text-sm">
            <Ticket className="w-5 h-5 text-indigo-600" />
            <span>Rifas Colombia</span>
          </Link>

          <a
            href={whatsappShareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 text-xs sm:text-sm font-bold shadow-xs transition"
          >
            <Share2 className="w-4 h-4" />
            <span>Compartir por WhatsApp</span>
          </a>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-3 sm:px-4 pt-5 space-y-5">
        {/* Encabezado de la rifa */}
        <section className="rounded-3xl bg-white border border-slate-200 p-5 sm:p-6 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full ${
                isClosed ? 'bg-slate-200 text-slate-800' : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {isClosed ? 'Rifa cerrada' : 'Rifa abierta · En vivo'}
            </span>
            <span className="text-sm font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-full">
              {formatCop(raffle.ticketPriceCop)} por número
            </span>
          </div>

          <h1 className="mt-3 text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            {raffle.name}
          </h1>

          {raffle.description && (
            <p className="mt-2 text-slate-600 text-sm sm:text-base whitespace-pre-line">
              {raffle.description}
            </p>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-indigo-50/70 border border-indigo-100 p-3.5">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-indigo-700">
                <Gift className="w-4 h-4" />
                <span>Premio</span>
              </div>
              <p className="mt-1 font-extrabold text-slate-900 text-sm sm:text-base">
                {raffle.prizeText}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3.5">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-600">
                <Calendar className="w-4 h-4" />
                <span>Fecha del sorteo</span>
              </div>
              <p className="mt-1 font-bold text-slate-900 text-sm sm:text-base capitalize">
                {formatDateCo(raffle.drawDate)}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3.5">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-600">
                <Ticket className="w-4 h-4" />
                <span>Lotería</span>
              </div>
              <p className="mt-1 font-bold text-slate-900 text-sm sm:text-base">
                {raffle.lotteryName}
              </p>
            </div>
          </div>

          <p className="mt-4 text-xs sm:text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5">
            Gana quien tenga el número igual a las <strong>dos últimas cifras</strong> del premio mayor de{' '}
            <strong>{raffle.lotteryName}</strong> en la fecha del sorteo.
          </p>
        </section>

        {/* Ganador si la rifa está cerrada */}
        {isClosed && (
          <section className="rounded-3xl bg-gradient-to-r from-amber-50 to-yellow-50 border-2 border-amber-300 p-5 shadow-xs">
            {raffle.winningNumber ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-14 h-14 rounded-2xl bg-amber-400 text-amber-950 flex items-center justify-center font-extrabold text-2xl shadow-sm shrink-0">
                    {raffle.winningNumber}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 text-amber-900 font-bold text-sm">
                      <Trophy className="w-4 h-4" />
                      <span>Resultado oficial del sorteo</span>
                    </div>
                    {raffle.winnerStatus === 'paid' && raffle.winnerName ? (
                      <p className="text-lg font-extrabold text-slate-900 mt-0.5">
                        ¡Ganador(a): {raffle.winnerName}! 🎉
                      </p>
                    ) : raffle.winnerStatus === 'pending' && raffle.winnerName ? (
                      <p className="text-base font-bold text-amber-900 mt-0.5">
                        Número {raffle.winningNumber} apartado por {raffle.winnerName} (pago pendiente)
                      </p>
                    ) : (
                      <p className="text-base font-bold text-slate-700 mt-0.5">
                        Número ganador {raffle.winningNumber} (quedó disponible)
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <p className="font-bold text-amber-950 text-sm sm:text-base">
                Esta rifa ya cerró. El organizador publicará pronto el número ganador.
              </p>
            )}
          </section>
        )}

        {/* Confirmación después de apartar números */}
        {confirmation && (
          <section
            id="confirmacion-apartado"
            className="rounded-3xl bg-white border-2 border-emerald-500 p-5 sm:p-6 shadow-md space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5 text-emerald-700">
                <CheckCircle2 className="w-7 h-7 shrink-0" />
                <div>
                  <h2 className="text-lg sm:text-xl font-extrabold text-slate-900">
                    ¡Números apartados con éxito!
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-600">
                    Tus números quedaron en amarillo (pendientes de pago) a nombre de{' '}
                    <strong>{confirmation.buyerName}</strong>.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfirmation(null)}
                aria-label="Cerrar confirmación"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3.5">
                <p className="text-xs font-bold text-amber-900 uppercase">Números apartados</p>
                <p className="mt-1 text-lg font-extrabold text-slate-900 tracking-wide">
                  {confirmation.numbers.join(', ')}
                </p>
              </div>
              <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-3.5">
                <p className="text-xs font-bold text-emerald-900 uppercase">Total a pagar</p>
                <p className="mt-1 text-lg font-extrabold text-emerald-800">
                  {formatCop(confirmation.totalCop)}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3.5">
                <p className="text-xs font-bold text-slate-700 uppercase flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Tiempo límite</span>
                </p>
                <p className="mt-1 text-sm font-bold text-slate-900">
                  {formatDateTimeCo(confirmation.expiresAt)}
                </p>
                <p className="text-xs text-slate-500">({confirmation.releaseHours}h para pagar)</p>
              </div>
            </div>

            <div className="rounded-2xl bg-slate-900 text-white p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wider text-indigo-300">
                  Instrucciones de pago
                </p>
                <button
                  type="button"
                  onClick={handleCopyInstructions}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 hover:bg-white/25 px-3 py-1.5 text-xs font-bold transition"
                >
                  {copiedInstructions ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-300" />
                      <span>¡Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar datos</span>
                    </>
                  )}
                </button>
              </div>
              <p className="text-sm sm:text-base whitespace-pre-line font-medium leading-relaxed">
                {confirmation.paymentInstructions}
              </p>
            </div>

            <p className="text-xs sm:text-sm text-slate-700 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5">
              <strong>Importante:</strong> El pago se realiza manualmente con los datos anteriores. El
              administrador confirmará tus números (pasarán a verde) apenas reciba tu transferencia o
              comprobante.
            </p>
          </section>
        )}

        {boardNotice && (
          <div
            role="alert"
            className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900 flex items-center justify-between gap-3"
          >
            <span className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
              {boardNotice}
            </span>
            <button
              type="button"
              onClick={() => setBoardNotice('')}
              className="text-rose-700 hover:text-rose-950 font-bold text-xs"
            >
              Cerrar
            </button>
          </div>
        )}

        {/* Leyenda y contador */}
        <NumberLegend
          available={counts.available}
          pending={counts.pending}
          paid={counts.paid}
        />

        {/* Tablero 00 - 99 */}
        <section className="rounded-3xl bg-white border border-slate-200 p-3.5 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
              {isClosed ? 'Tablero final (00 al 99)' : 'Elige tus números (00 al 99)'}
            </h2>
            <span className="text-xs text-slate-400">Se actualiza automáticamente</span>
          </div>

          <NumberGrid
            numbers={numbers}
            selectedNumbers={selected}
            winningNumber={raffle.winningNumber}
            disabled={isClosed}
            onNumberClick={handleToggleNumber}
          />
        </section>
      </main>

      {/* Barra inferior fija cuando el visitante tiene números seleccionados */}
      {!isClosed && selected.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-slate-200 shadow-2xl">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-500 truncate">
                {selected.length} {selected.length === 1 ? 'número elegido' : 'números elegidos'}:{' '}
                <span className="text-slate-900 font-bold">{selected.join(', ')}</span>
              </p>
              <p className="text-base sm:text-lg font-extrabold text-indigo-700">
                Total: {formatCop(totalCop)}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setFormError('');
                setShowModal(true);
              }}
              className="shrink-0 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white font-extrabold px-5 py-3 text-sm sm:text-base shadow-md transition"
            >
              Apartar números
            </button>
          </div>
        </div>
      )}

      {/* Modal formulario de compra */}
      {showModal && (
        <div className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl bg-white p-5 sm:p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-xl font-extrabold text-slate-900">Apartar tus números</h2>
                <p className="text-xs text-slate-500">Sin cuenta ni contraseña · Confirmación inmediata</p>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                aria-label="Cerrar formulario"
                className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 rounded-2xl bg-indigo-50 border border-indigo-100 p-3.5 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-indigo-800 uppercase">Números seleccionados</p>
                <p className="font-extrabold text-slate-900 mt-0.5">{selected.join(', ')}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-indigo-800 uppercase">Total</p>
                <p className="text-lg font-extrabold text-indigo-700">{formatCop(totalCop)}</p>
              </div>
            </div>

            <form onSubmit={handleSubmitReservation} className="mt-4 space-y-4">
              {formError && (
                <div
                  role="alert"
                  className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-sm font-semibold text-rose-800"
                >
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-sm font-bold text-slate-800 mb-1">
                  Nombre completo <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ej: Camila Rodríguez"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-800 mb-1">
                  Celular o WhatsApp (10 dígitos) <span className="text-rose-600">*</span>
                </label>
                <input
                  type="tel"
                  inputMode="numeric"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Ej: 3001234567"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Formato colombiano de 10 dígitos iniciando en 3.
                </p>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-800 mb-1">
                  Dirección o ciudad <span className="text-slate-400 font-normal">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Ej: Barrio El Poblado, Medellín"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-extrabold py-3.5 px-5 text-base shadow-md transition"
                >
                  {submitting ? 'Apartando...' : `Confirmar apartado (${formatCop(totalCop)})`}
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="w-full sm:w-auto rounded-2xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold py-3.5 px-5 text-sm"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
