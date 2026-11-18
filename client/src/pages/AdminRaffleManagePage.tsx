import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  MessageCircle,
  RefreshCw,
  Search,
  Trophy,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { GridNumberItem, NumberGrid, NumberLegend } from '../components/NumberGrid';
import { AdminRaffleFormInitial, RaffleFormModal } from '../components/RaffleFormModal';
import { ApiError, apiFetch } from '../utils/api';
import {
  buildPaymentConfirmedWhatsAppMessage,
  buildPaymentReminderWhatsAppMessage,
  buildWhatsAppDirectUrl,
  formatCop,
  formatDateCo,
  formatDateTimeCo,
  normalizeColombianPhone,
} from '../utils/format';

interface AdminNumberDetail extends GridNumberItem {
  paymentMethod?: string;
  reservedAt?: string;
  expiresAt?: string | null;
  paidAt?: string | null;
  buyer: {
    buyerId: number;
    fullName: string;
    phone: string;
    address: string;
  } | null;
}

interface ParticipantRow {
  buyerId: number;
  fullName: string;
  phone: string;
  address: string;
  numbers: string[];
  pendingNumbers: string[];
  paidNumbers: string[];
  totalCop: number;
  status: 'pending' | 'paid' | 'mixed';
  paymentMethods: string[];
  createdAt: string;
  earliestExpiresAt: string | null;
}

interface AdminRaffleDetailResponse {
  raffle: AdminRaffleFormInitial & {
    id: number;
    winningNumber: string | null;
    createdAt: string;
    updatedAt: string;
  };
  counts: {
    available: number;
    pending: number;
    paid: number;
    totalCollectedCop: number;
    pendingAmountCop: number;
  };
  numbers: AdminNumberDetail[];
  participants: ParticipantRow[];
}

const PAYMENT_METHODS = ['Nequi', 'Daviplata', 'Efectivo', 'Transferencia', 'Llave Bre-B'];

export function AdminRaffleManagePage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<AdminRaffleDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [activeTab, setActiveTab] = useState<'board' | 'participants'>('board');
  const [copiedLink, setCopiedLink] = useState(false);

  // Modal de inspección / acción de número tomado
  const [inspectedNumber, setInspectedNumber] = useState<AdminNumberDetail | null>(null);
  const [actionMethod, setActionMethod] = useState('Nequi');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  // Reasignar número tomado
  const [showReassign, setShowReassign] = useState(false);
  const [reassignName, setReassignName] = useState('');
  const [reassignPhone, setReassignPhone] = useState('');
  const [reassignAddress, setReassignAddress] = useState('');
  const [reassignPaid, setReassignPaid] = useState(true);

  // Asignar manualmente venta en persona (números disponibles)
  const [showManualAssign, setShowManualAssign] = useState(false);
  const [manualNumbers, setManualNumbers] = useState<string[]>([]);
  const [manualName, setManualName] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [manualAddress, setManualAddress] = useState('');
  const [manualMethod, setManualMethod] = useState('Efectivo');
  const [manualPaid, setManualPaid] = useState(true);
  const [manualError, setManualError] = useState('');

  // Banner de confirmación por WhatsApp tras confirmar pago
  const [whatsAppConfirmBanner, setWhatsAppConfirmBanner] = useState<{
    buyerName: string;
    phone: string;
    numbers: string[];
  } | null>(null);

  // Participantes: búsqueda y filtro
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'paid'>('all');

  // Modales de edición y ganador
  const [showEditModal, setShowEditModal] = useState(false);
  const [showWinnerModal, setShowWinnerModal] = useState(false);
  const [winnerInput, setWinnerInput] = useState('');
  const [winnerError, setWinnerError] = useState('');

  const fetchDetail = useCallback(
    async (silent = false) => {
      if (!id) return;
      if (!silent) setLoading(true);
      try {
        const res = await apiFetch<AdminRaffleDetailResponse>(`/api/admin/raffles/${id}`);
        setData(res);
        setError('');
        setInspectedNumber((prev) =>
          prev ? res.numbers.find((n) => n.number === prev.number) ?? null : null
        );
      } catch (err) {
        if (!silent) {
          setError(err instanceof Error ? err.message : 'No se pudo cargar la rifa.');
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [id]
  );

  useEffect(() => {
    fetchDetail(false);
    const interval = window.setInterval(() => fetchDetail(true), 6000);
    return () => window.clearInterval(interval);
  }, [fetchDetail]);

  const handleCopyPublicLink = async () => {
    if (!data) return;
    const url = `${window.location.origin}/r/${data.raffle.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      window.prompt('Copia este enlace:', url);
    }
  };

  const handleNumberClick = (item: GridNumberItem) => {
    if (!data) return;
    const detail = data.numbers.find((n) => n.number === item.number);
    if (!detail) return;

    if (detail.status === 'available') {
      setManualNumbers([detail.number]);
      setManualName('');
      setManualPhone('');
      setManualAddress('');
      setManualMethod('Efectivo');
      setManualPaid(true);
      setManualError('');
      setShowManualAssign(true);
    } else {
      setActionError('');
      setShowReassign(false);
      setActionMethod(detail.paymentMethod || 'Nequi');
      setInspectedNumber(detail);
    }
  };

  const handleConfirmSingleNumber = async () => {
    if (!data || !inspectedNumber || !inspectedNumber.buyer) return;
    setActionBusy(true);
    setActionError('');
    try {
      const res = await apiFetch<{
        confirmed: { number: string; buyerName: string; buyerPhone: string };
      }>(`/api/admin/raffles/${data.raffle.id}/numbers/${inspectedNumber.number}/confirm`, {
        method: 'POST',
        body: JSON.stringify({ paymentMethod: actionMethod }),
      });
      setWhatsAppConfirmBanner({
        buyerName: res.confirmed.buyerName,
        phone: res.confirmed.buyerPhone,
        numbers: [res.confirmed.number],
      });
      await fetchDetail(true);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'No se pudo confirmar el pago.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleReleaseSingleNumber = async () => {
    if (!data || !inspectedNumber) return;
    if (
      !window.confirm(
        `¿Liberar el número ${inspectedNumber.number}? Volverá a quedar disponible en el tablero.`
      )
    ) {
      return;
    }
    setActionBusy(true);
    setActionError('');
    try {
      await apiFetch(
        `/api/admin/raffles/${data.raffle.id}/numbers/${inspectedNumber.number}/release`,
        { method: 'POST' }
      );
      setInspectedNumber(null);
      await fetchDetail(true);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'No se pudo liberar el número.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleReassignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data || !inspectedNumber) return;
    const cleanPhone = normalizeColombianPhone(reassignPhone);
    if (reassignName.trim().length < 3) {
      setActionError('Escribe el nombre del nuevo comprador.');
      return;
    }
    if (!cleanPhone) {
      setActionError('Ingresa un celular colombiano válido de 10 dígitos.');
      return;
    }

    setActionBusy(true);
    setActionError('');
    try {
      await apiFetch(
        `/api/admin/raffles/${data.raffle.id}/numbers/${inspectedNumber.number}/reassign`,
        {
          method: 'POST',
          body: JSON.stringify({
            fullName: reassignName.trim(),
            phone: cleanPhone,
            address: reassignAddress.trim(),
            markPaid: reassignPaid,
            paymentMethod: reassignPaid ? actionMethod : '',
          }),
        }
      );
      if (reassignPaid) {
        setWhatsAppConfirmBanner({
          buyerName: reassignName.trim(),
          phone: cleanPhone,
          numbers: [inspectedNumber.number],
        });
      }
      setShowReassign(false);
      await fetchDetail(true);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'No se pudo reasignar el número.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleManualAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data) return;
    const cleanPhone = normalizeColombianPhone(manualPhone);
    if (manualNumbers.length === 0) {
      setManualError('Selecciona al menos un número disponible.');
      return;
    }
    if (manualName.trim().length < 3) {
      setManualError('Ingresa el nombre completo del comprador.');
      return;
    }
    if (!cleanPhone) {
      setManualError('Ingresa un celular colombiano válido de 10 dígitos (ej: 3001234567).');
      return;
    }

    setActionBusy(true);
    setManualError('');
    try {
      await apiFetch(`/api/admin/raffles/${data.raffle.id}/numbers/assign`, {
        method: 'POST',
        body: JSON.stringify({
          numbers: manualNumbers,
          fullName: manualName.trim(),
          phone: cleanPhone,
          address: manualAddress.trim(),
          markPaid: manualPaid,
          paymentMethod: manualPaid ? manualMethod : '',
        }),
      });
      if (manualPaid) {
        setWhatsAppConfirmBanner({
          buyerName: manualName.trim(),
          phone: cleanPhone,
          numbers: [...manualNumbers].sort(),
        });
      }
      setShowManualAssign(false);
      await fetchDetail(true);
    } catch (err) {
      setManualError(err instanceof ApiError ? err.message : 'No se pudo asignar.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleConfirmAllForBuyer = async (participant: ParticipantRow) => {
    if (!data) return;
    try {
      const res = await apiFetch<{
        confirmedBuyer: { fullName: string; phone: string; numbers: string[] };
      }>(`/api/admin/raffles/${data.raffle.id}/buyers/${participant.buyerId}/confirm-all`, {
        method: 'POST',
        body: JSON.stringify({ paymentMethod: 'Confirmado por admin' }),
      });
      setWhatsAppConfirmBanner({
        buyerName: res.confirmedBuyer.fullName,
        phone: res.confirmedBuyer.phone,
        numbers: res.confirmedBuyer.numbers,
      });
      await fetchDetail(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo confirmar el pago.');
    }
  };

  const handleSaveWinner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data) return;
    if (!/^[0-9]{2}$/.test(winnerInput)) {
      setWinnerError('Escribe exactamente dos cifras (entre 00 y 99).');
      return;
    }
    setActionBusy(true);
    setWinnerError('');
    try {
      await apiFetch(`/api/admin/raffles/${data.raffle.id}/winner`, {
        method: 'POST',
        body: JSON.stringify({ winningNumber: winnerInput }),
      });
      setShowWinnerModal(false);
      await fetchDetail(true);
    } catch (err) {
      setWinnerError(err instanceof ApiError ? err.message : 'No se pudo registrar el ganador.');
    } finally {
      setActionBusy(false);
    }
  };

  const filteredParticipants = useMemo(() => {
    if (!data) return [];
    const q = searchQuery.trim().toLowerCase();
    return data.participants.filter((p) => {
      if (statusFilter === 'pending' && p.pendingNumbers.length === 0) return false;
      if (statusFilter === 'paid' && p.paidNumbers.length === 0) return false;
      if (!q) return true;
      return (
        p.fullName.toLowerCase().includes(q) ||
        p.phone.includes(q) ||
        p.numbers.some((n) => n.includes(q))
      );
    });
  }, [data, searchQuery, statusFilter]);

  const availableNumberStrings = useMemo(() => {
    if (!data) return [];
    return data.numbers.filter((n) => n.status === 'available').map((n) => n.number);
  }, [data]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3 text-slate-600">
          <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
          <p className="font-semibold">Cargando panel de la rifa...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-2xl bg-white border border-slate-200 p-6 text-center">
          <p className="font-bold text-rose-700">{error || 'Rifa no encontrada.'}</p>
          <Link
            to="/admin"
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 text-white px-4 py-2 text-sm font-bold"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver a Mis Rifas
          </Link>
        </div>
      </div>
    );
  }

  const { raffle, counts, numbers } = data;
  const confirmWhatsAppUrl = whatsAppConfirmBanner
    ? buildWhatsAppDirectUrl(
        whatsAppConfirmBanner.phone,
        buildPaymentConfirmedWhatsAppMessage({
          buyerName: whatsAppConfirmBanner.buyerName,
          raffleName: raffle.name,
          numbers: whatsAppConfirmBanner.numbers,
          prizeText: raffle.prizeText,
          drawDate: raffle.drawDate,
          lotteryName: raffle.lotteryName,
        })
      )
    : '#';

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <Link
              to="/admin"
              className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 shrink-0"
              aria-label="Volver a Mis Rifas"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-extrabold text-slate-900 truncate">
                {raffle.name}
              </h1>
              <p className="text-xs text-slate-500 truncate">
                {raffle.lotteryName} · {formatDateCo(raffle.drawDate)} ·{' '}
                {formatCop(raffle.ticketPriceCop)}/núm
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopyPublicLink}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700"
            >
              {copiedLink ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>¡Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copiar enlace</span>
                </>
              )}
            </button>

            {raffle.status !== 'draft' && (
              <Link
                to={`/r/${raffle.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700"
              >
                <ExternalLink className="w-4 h-4" />
                <span className="hidden sm:inline">Ver pública</span>
              </Link>
            )}

            <button
              type="button"
              onClick={() => setShowEditModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700"
            >
              <Edit3 className="w-4 h-4" />
              <span className="hidden sm:inline">Editar</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 pt-5 space-y-5">
        {/* Banner inmediato tras confirmar pago para enviar WhatsApp */}
        {whatsAppConfirmBanner && (
          <div className="rounded-2xl bg-emerald-50 border-2 border-emerald-400 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
            <div>
              <p className="font-extrabold text-emerald-950 text-sm sm:text-base">
                ✅ Pago confirmado para {whatsAppConfirmBanner.buyerName} (
                {whatsAppConfirmBanner.numbers.join(', ')})
              </p>
              <p className="text-xs text-emerald-800 mt-0.5">
                Envíale ahora su recibo por WhatsApp con sus números, el premio, la fecha del sorteo y buena suerte.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={confirmWhatsAppUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 text-xs sm:text-sm shadow"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Enviar confirmación por WhatsApp</span>
              </a>
              <button
                type="button"
                onClick={() => setWhatsAppConfirmBanner(null)}
                aria-label="Cerrar aviso"
                className="p-2 rounded-lg text-emerald-800 hover:bg-emerald-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Resumen */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-xs">
            <p className="text-xs font-bold text-slate-500 uppercase">Disponibles</p>
            <p className="mt-1 text-2xl font-extrabold text-slate-900">{counts.available}</p>
          </div>
          <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 shadow-xs">
            <p className="text-xs font-bold text-amber-900 uppercase">Apartados (pend.)</p>
            <p className="mt-1 text-2xl font-extrabold text-amber-950">{counts.pending}</p>
            <p className="text-xs text-amber-800">{formatCop(counts.pendingAmountCop)}</p>
          </div>
          <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 shadow-xs">
            <p className="text-xs font-bold text-emerald-900 uppercase">Pagados</p>
            <p className="mt-1 text-2xl font-extrabold text-emerald-950">{counts.paid}</p>
          </div>
          <div className="rounded-2xl bg-indigo-600 text-white p-4 shadow-sm">
            <p className="text-xs font-bold text-indigo-100 uppercase">Total recaudado</p>
            <p className="mt-1 text-xl sm:text-2xl font-extrabold">
              {formatCop(counts.totalCollectedCop)}
            </p>
          </div>
        </section>

        {/* Barra de acciones */}
        <section className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex bg-slate-200/80 p-1 rounded-2xl">
            <button
              type="button"
              onClick={() => setActiveTab('board')}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold transition ${
                activeTab === 'board'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Tablero 00–99</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('participants')}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold transition ${
                activeTab === 'participants'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Participantes ({data.participants.length})</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setManualNumbers(availableNumberStrings.slice(0, 1));
                setManualName('');
                setManualPhone('');
                setManualAddress('');
                setManualMethod('Efectivo');
                setManualPaid(true);
                setManualError('');
                setShowManualAssign(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3.5 py-2 text-xs sm:text-sm shadow-xs"
            >
              <UserPlus className="w-4 h-4" />
              <span>Venta en persona</span>
            </button>

            <a
              href={`/api/admin/raffles/${raffle.id}/export-csv`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-bold px-3.5 py-2 text-xs sm:text-sm"
            >
              <Download className="w-4 h-4" />
              <span>Exportar CSV</span>
            </a>

            <button
              type="button"
              onClick={() => {
                setWinnerInput(raffle.winningNumber ?? '');
                setWinnerError('');
                setShowWinnerModal(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-amber-950 font-extrabold px-3.5 py-2 text-xs sm:text-sm shadow-xs"
            >
              <Trophy className="w-4 h-4" />
              <span>
                {raffle.winningNumber ? `Ganador: ${raffle.winningNumber}` : 'Registrar ganador'}
              </span>
            </button>
          </div>
        </section>

        {activeTab === 'board' && (
          <div className="space-y-4">
            <NumberLegend
              available={counts.available}
              pending={counts.pending}
              paid={counts.paid}
            />

            <div className="rounded-3xl bg-white border border-slate-200 p-3.5 sm:p-5 shadow-xs">
              <p className="text-xs sm:text-sm text-slate-500 mb-3">
                Toca cualquier número <strong>amarillo o verde</strong> para ver el comprador, confirmar pago, liberar o reasignar. Toca uno <strong>disponible</strong> para asignarlo manualmente.
              </p>

              <NumberGrid
                numbers={numbers}
                winningNumber={raffle.winningNumber}
                allowClickTaken
                activeInspectNumber={inspectedNumber?.number ?? null}
                onNumberClick={handleNumberClick}
              />
            </div>
          </div>
        )}

        {activeTab === 'participants' && (
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar por nombre, celular o número (ej: 27)..."
                  className="w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="inline-flex bg-white border border-slate-300 rounded-xl p-1 self-start">
                {(
                  [
                    ['all', 'Todos'],
                    ['pending', 'Pendientes'],
                    ['paid', 'Pagados'],
                  ] as const
                ).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setStatusFilter(val)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                      statusFilter === val
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {filteredParticipants.length === 0 ? (
              <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center text-sm text-slate-500">
                No hay participantes que coincidan con el filtro.
              </div>
            ) : (
              <div className="space-y-3">
                {filteredParticipants.map((p) => {
                  const statusBadge =
                    p.status === 'paid'
                      ? 'bg-emerald-100 text-emerald-900'
                      : p.status === 'pending'
                      ? 'bg-amber-100 text-amber-950'
                      : 'bg-indigo-100 text-indigo-900';
                  const statusLabel =
                    p.status === 'paid'
                      ? 'Pagado'
                      : p.status === 'pending'
                      ? 'Pendiente'
                      : 'Parcial';

                  const confirmedWaUrl = buildWhatsAppDirectUrl(
                    p.phone,
                    buildPaymentConfirmedWhatsAppMessage({
                      buyerName: p.fullName,
                      raffleName: raffle.name,
                      numbers: p.paidNumbers.length > 0 ? p.paidNumbers : p.numbers,
                      prizeText: raffle.prizeText,
                      drawDate: raffle.drawDate,
                      lotteryName: raffle.lotteryName,
                    })
                  );

                  const reminderWaUrl = buildWhatsAppDirectUrl(
                    p.phone,
                    buildPaymentReminderWhatsAppMessage({
                      buyerName: p.fullName,
                      raffleName: raffle.name,
                      numbers: p.pendingNumbers,
                      totalCop: p.pendingNumbers.length * raffle.ticketPriceCop,
                      paymentInstructions: raffle.paymentInstructions,
                    })
                  );

                  return (
                    <div
                      key={p.buyerId}
                      className="rounded-2xl bg-white border border-slate-200 p-4 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-extrabold text-slate-900 text-base">
                            {p.fullName}
                          </h3>
                          <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${statusBadge}`}>
                            {statusLabel}
                          </span>
                        </div>

                        <p className="text-sm text-slate-600">
                          📱 <strong>{p.phone}</strong>
                          {p.address ? ` · 📍 ${p.address}` : ''}
                        </p>

                        <p className="text-sm text-slate-700">
                          🎟️ Números:{' '}
                          <strong className="text-slate-950">{p.numbers.join(', ')}</strong> · Total:{' '}
                          <strong className="text-indigo-700">{formatCop(p.totalCop)}</strong>
                        </p>

                        <p className="text-xs text-slate-400">
                          Apartado: {formatDateTimeCo(p.createdAt)}
                          {p.paymentMethods.length > 0 && ` · Pago: ${p.paymentMethods.join(', ')}`}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {p.pendingNumbers.length > 0 && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleConfirmAllForBuyer(p)}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3.5 py-2 text-xs sm:text-sm"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              <span>Confirmar pago</span>
                            </button>

                            <a
                              href={reminderWaUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-950 font-bold px-3 py-2 text-xs sm:text-sm"
                            >
                              <Clock className="w-4 h-4" />
                              <span>Recordar WhatsApp</span>
                            </a>
                          </>
                        )}

                        {p.paidNumbers.length > 0 && (
                          <a
                            href={confirmedWaUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-bold px-3 py-2 text-xs sm:text-sm"
                          >
                            <MessageCircle className="w-4 h-4" />
                            <span>Confirmación WhatsApp</span>
                          </a>
                        )}

                        {p.paidNumbers.length === 0 && p.pendingNumbers.length === 0 && (
                          <a
                            href={`https://wa.me/57${p.phone}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700"
                          >
                            <MessageCircle className="w-4 h-4" />
                            <span>WhatsApp</span>
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </main>

      {/* Modal inspeccionar número amarillo o verde */}
      {inspectedNumber && inspectedNumber.buyer && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl bg-white p-5 sm:p-6 shadow-2xl max-h-[92vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <span
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl font-extrabold border-2 ${
                    inspectedNumber.status === 'paid'
                      ? 'bg-emerald-100 border-emerald-500 text-emerald-950'
                      : 'bg-amber-100 border-amber-400 text-amber-950'
                  }`}
                >
                  {inspectedNumber.number}
                </span>
                <div>
                  <h2 className="text-lg font-extrabold text-slate-900">
                    Número {inspectedNumber.number}
                  </h2>
                  <p className="text-xs font-bold text-slate-500">
                    {inspectedNumber.status === 'paid' ? 'Pago confirmado' : 'Pendiente de pago'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Cerrar detalle de número"
                onClick={() => setInspectedNumber(null)}
                className="p-2 rounded-xl text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {actionError && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-800">
                {actionError}
              </div>
            )}

            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-1.5 text-sm">
              <p>
                <span className="text-slate-500">Comprador:</span>{' '}
                <strong className="text-slate-900">{inspectedNumber.buyer.fullName}</strong>
              </p>
              <p>
                <span className="text-slate-500">Celular / WhatsApp:</span>{' '}
                <strong className="text-slate-900">{inspectedNumber.buyer.phone}</strong>
              </p>
              {inspectedNumber.buyer.address && (
                <p>
                  <span className="text-slate-500">Dirección:</span>{' '}
                  <strong className="text-slate-900">{inspectedNumber.buyer.address}</strong>
                </p>
              )}
              {inspectedNumber.reservedAt && (
                <p className="text-xs text-slate-500 pt-1">
                  Apartado el {formatDateTimeCo(inspectedNumber.reservedAt)}
                </p>
              )}
              {inspectedNumber.status === 'pending' && inspectedNumber.expiresAt && (
                <p className="text-xs text-amber-800 font-semibold">
                  Vence automáticamente: {formatDateTimeCo(inspectedNumber.expiresAt)}
                </p>
              )}
              {inspectedNumber.status === 'paid' && inspectedNumber.paidAt && (
                <p className="text-xs text-emerald-800 font-semibold">
                  Pagado el {formatDateTimeCo(inspectedNumber.paidAt)}
                  {inspectedNumber.paymentMethod ? ` (${inspectedNumber.paymentMethod})` : ''}
                </p>
              )}
            </div>

            {!showReassign ? (
              <div className="space-y-3">
                {inspectedNumber.status === 'pending' && (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3.5 space-y-2.5">
                    <label className="block text-xs font-bold text-emerald-950 uppercase">
                      Método de pago recibido
                    </label>
                    <select
                      value={actionMethod}
                      onChange={(e) => setActionMethod(e.target.value)}
                      className="w-full rounded-xl border border-emerald-300 bg-white px-3 py-2 text-sm font-semibold"
                    >
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={handleConfirmSingleNumber}
                      className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3 text-sm shadow transition"
                    >
                      {actionBusy ? 'Confirmando...' : 'Confirmar pago (pasar a verde)'}
                    </button>
                  </div>
                )}

                {inspectedNumber.status === 'paid' && (
                  <a
                    href={buildWhatsAppDirectUrl(
                      inspectedNumber.buyer.phone,
                      buildPaymentConfirmedWhatsAppMessage({
                        buyerName: inspectedNumber.buyer.fullName,
                        raffleName: raffle.name,
                        numbers: [inspectedNumber.number],
                        prizeText: raffle.prizeText,
                        drawDate: raffle.drawDate,
                        lotteryName: raffle.lotteryName,
                      })
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3 text-sm shadow"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>Enviar confirmación por WhatsApp</span>
                  </a>
                )}

                {inspectedNumber.status === 'pending' && (
                  <a
                    href={buildWhatsAppDirectUrl(
                      inspectedNumber.buyer.phone,
                      buildPaymentReminderWhatsAppMessage({
                        buyerName: inspectedNumber.buyer.fullName,
                        raffleName: raffle.name,
                        numbers: [inspectedNumber.number],
                        totalCop: raffle.ticketPriceCop,
                        paymentInstructions: raffle.paymentInstructions,
                      })
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-950 font-bold py-2.5 text-sm"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>Recordar pago por WhatsApp</span>
                  </a>
                )}

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setReassignName('');
                      setReassignPhone('');
                      setReassignAddress('');
                      setReassignPaid(true);
                      setShowReassign(true);
                    }}
                    className="rounded-xl border border-slate-300 bg-white hover:bg-slate-50 font-bold py-2.5 text-xs sm:text-sm text-slate-800"
                  >
                    Reasignar comprador
                  </button>
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={handleReleaseSingleNumber}
                    className="rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 font-bold py-2.5 text-xs sm:text-sm text-rose-800"
                  >
                    Liberar número
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleReassignSubmit} className="space-y-3 border-t border-slate-100 pt-3">
                <h3 className="font-bold text-slate-900 text-sm">
                  Reasignar número {inspectedNumber.number} a otro comprador
                </h3>
                <input
                  type="text"
                  required
                  value={reassignName}
                  onChange={(e) => setReassignName(e.target.value)}
                  placeholder="Nombre completo *"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  type="tel"
                  required
                  value={reassignPhone}
                  onChange={(e) => setReassignPhone(e.target.value)}
                  placeholder="Celular 10 dígitos (ej: 3001234567) *"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  value={reassignAddress}
                  onChange={(e) => setReassignAddress(e.target.value)}
                  placeholder="Dirección (opcional)"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={reassignPaid}
                    onChange={(e) => setReassignPaid(e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  <span>Marcar directamente como pagado (verde)</span>
                </label>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={actionBusy}
                    className="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 text-sm"
                  >
                    {actionBusy ? 'Guardando...' : 'Guardar reasignación'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowReassign(false)}
                    className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700"
                  >
                    Volver
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal asignar venta en persona */}
      {showManualAssign && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl bg-white p-5 sm:p-6 shadow-2xl max-h-[92vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">
                  Asignar números manualmente
                </h2>
                <p className="text-xs text-slate-500">Para ventas en persona o por chat directo</p>
              </div>
              <button
                type="button"
                onClick={() => setShowManualAssign(false)}
                className="p-2 rounded-xl text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {manualError && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-800">
                {manualError}
              </div>
            )}

            <form onSubmit={handleManualAssignSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                  Números disponibles seleccionados ({manualNumbers.length})
                </label>
                <div className="max-h-32 overflow-y-auto rounded-xl border border-slate-200 p-2 flex flex-wrap gap-1.5 bg-slate-50">
                  {availableNumberStrings.map((num) => {
                    const checked = manualNumbers.includes(num);
                    return (
                      <button
                        key={num}
                        type="button"
                        onClick={() =>
                          setManualNumbers((prev) =>
                            prev.includes(num)
                              ? prev.filter((n) => n !== num)
                              : [...prev, num].sort()
                          )
                        }
                        className={`px-2.5 py-1 rounded-lg text-xs font-extrabold border transition ${
                          checked
                            ? 'bg-indigo-600 text-white border-indigo-700'
                            : 'bg-white text-slate-700 border-slate-300'
                        }`}
                      >
                        {num}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-800 mb-1">
                  Nombre completo <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="Nombre del comprador"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-800 mb-1">
                  Celular / WhatsApp (10 dígitos) <span className="text-rose-600">*</span>
                </label>
                <input
                  type="tel"
                  required
                  value={manualPhone}
                  onChange={(e) => setManualPhone(e.target.value)}
                  placeholder="Ej: 3001234567"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-800 mb-1">
                  Dirección (opcional)
                </label>
                <input
                  type="text"
                  value={manualAddress}
                  onChange={(e) => setManualAddress(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm"
                />
              </div>

              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3 space-y-2">
                <label className="flex items-center gap-2 text-sm font-bold text-slate-800">
                  <input
                    type="checkbox"
                    checked={manualPaid}
                    onChange={(e) => setManualPaid(e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  <span>Marcar directamente como pagado (verde)</span>
                </label>

                {manualPaid && (
                  <select
                    value={manualMethod}
                    onChange={(e) => setManualMethod(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold"
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <button
                type="submit"
                disabled={actionBusy}
                className="w-full rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold py-3 text-sm shadow"
              >
                {actionBusy
                  ? 'Asignando...'
                  : `Asignar ${manualNumbers.length} número(s) (${formatCop(
                      manualNumbers.length * raffle.ticketPriceCop
                    )})`}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal registrar ganador */}
      {showWinnerModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-500" />
                <h2 className="text-lg font-extrabold text-slate-900">
                  Registrar número ganador
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowWinnerModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-slate-600">
              Ingresa las <strong>dos últimas cifras</strong> del premio mayor de{' '}
              <strong>{raffle.lotteryName}</strong>. Al guardar, la rifa pasará a estado{' '}
              <strong>Cerrada</strong> y el tablero público mostrará el ganador.
            </p>

            {winnerError && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-800">
                {winnerError}
              </div>
            )}

            <form onSubmit={handleSaveWinner} className="space-y-4">
              <input
                type="text"
                inputMode="numeric"
                maxLength={2}
                required
                value={winnerInput}
                onChange={(e) => setWinnerInput(e.target.value.replace(/\D/g, '').slice(0, 2))}
                placeholder="Ej: 47"
                className="w-full text-center text-3xl font-extrabold tracking-widest rounded-2xl border-2 border-amber-300 py-3 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <button
                type="submit"
                disabled={actionBusy}
                className="w-full rounded-2xl bg-amber-500 hover:bg-amber-600 text-amber-950 font-extrabold py-3 text-base shadow"
              >
                {actionBusy ? 'Guardando...' : 'Cerrar rifa y publicar ganador'}
              </button>
            </form>
          </div>
        </div>
      )}

      {showEditModal && (
        <RaffleFormModal
          initial={raffle}
          onClose={() => setShowEditModal(false)}
          onSaved={() => {
            setShowEditModal(false);
            fetchDetail(true);
          }}
        />
      )}
    </div>
  );
}
