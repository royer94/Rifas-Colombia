import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Calendar,
  Check,
  Copy,
  Edit3,
  ExternalLink,
  KeyRound,
  LogOut,
  Plus,
  ShieldCheck,
  Ticket,
  Trash2,
  Trophy,
  X,
} from 'lucide-react';
import { AdminRaffleFormInitial, RaffleFormModal } from '../components/RaffleFormModal';
import { AdminProfile } from './AdminLoginPage';
import { ApiError, apiFetch } from '../utils/api';
import { formatCop, formatDateCo } from '../utils/format';

interface AdminRaffleItem extends AdminRaffleFormInitial {
  id: number;
  winningNumber: string | null;
  counts: {
    available: number;
    pending: number;
    paid: number;
  };
  totalCollectedCop: number;
  pendingAmountCop: number;
}

interface AdminDashboardPageProps {
  admin: AdminProfile;
  onAdminUpdated: (admin: AdminProfile) => void;
  onLogout: () => void;
}

export function AdminDashboardPage({
  admin,
  onAdminUpdated,
  onLogout,
}: AdminDashboardPageProps) {
  const [raffles, setRaffles] = useState<AdminRaffleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showRaffleModal, setShowRaffleModal] = useState(false);
  const [editingRaffle, setEditingRaffle] = useState<AdminRaffleItem | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);

  const fetchRaffles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ raffles: AdminRaffleItem[] }>('/api/admin/raffles');
      setRaffles(res.raffles);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar tus rifas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRaffles();
  }, [fetchRaffles]);

  const handleCopyPublicLink = async (slug: string) => {
    const url = `${window.location.origin}/r/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedSlug(slug);
      setTimeout(() => setCopiedSlug(null), 2000);
    } catch {
      window.prompt('Copia este enlace de tu rifa:', url);
    }
  };

  const handleDeleteRaffle = async (raffle: AdminRaffleItem) => {
    if (
      !window.confirm(
        `¿Seguro que quieres eliminar la rifa "${raffle.name}"? Se borrarán todos sus números y compradores.`
      )
    ) {
      return;
    }
    try {
      await apiFetch(`/api/admin/raffles/${raffle.id}`, { method: 'DELETE' });
      await fetchRaffles();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo eliminar la rifa.');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    if (newPassword.length < 8) {
      setPasswordError('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }
    setPasswordSaving(true);
    try {
      await apiFetch('/api/admin/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      onAdminUpdated({ ...admin, mustChangePassword: false });
      setShowPasswordModal(false);
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setPasswordError(
        err instanceof ApiError ? err.message : 'No se pudo cambiar la contraseña.'
      );
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleLogoutClick = async () => {
    await apiFetch('/api/admin/auth/logout', { method: 'POST' }).catch(() => {});
    onLogout();
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-extrabold text-slate-900 leading-tight">
                Mis Rifas
              </h1>
              <p className="text-xs text-slate-500">
                Sesión: <strong>{admin.displayName}</strong> (@{admin.username})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setPasswordError('');
                setShowPasswordModal(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-3 py-2 text-xs sm:text-sm font-semibold text-slate-700"
            >
              <KeyRound className="w-4 h-4 text-slate-500" />
              <span className="hidden sm:inline">Cambiar clave</span>
            </button>
            <button
              type="button"
              onClick={handleLogoutClick}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 px-3 py-2 text-xs sm:text-sm font-semibold text-slate-700 transition"
            >
              <LogOut className="w-4 h-4" />
              <span>Salir</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 pt-6 space-y-6">
        {admin.mustChangePassword && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-950">
                <p className="font-bold">Estás usando la contraseña inicial por defecto</p>
                <p className="text-xs text-amber-800 mt-0.5">
                  Por seguridad, cambia la contraseña de <strong>admin</strong> apenas puedas.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowPasswordModal(true)}
              className="shrink-0 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold px-4 py-2 text-xs sm:text-sm"
            >
              Cambiar contraseña ahora
            </button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900">
              Panel de rifas organizadas
            </h2>
            <p className="text-sm text-slate-500">
              Solo tú ves y administras las rifas creadas desde tu cuenta.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setEditingRaffle(null);
              setShowRaffleModal(true);
            }}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold px-5 py-3 text-sm sm:text-base shadow-md transition"
          >
            <Plus className="w-5 h-5" />
            <span>Nueva rifa</span>
          </button>
        </div>

        {error && (
          <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 text-sm text-rose-800 font-semibold">
            {error}
          </div>
        )}

        {loading && (
          <div className="grid gap-4 sm:grid-cols-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-48 rounded-2xl bg-white border border-slate-200 animate-pulse" />
            ))}
          </div>
        )}

        {!loading && raffles.length === 0 && (
          <div className="rounded-3xl bg-white border border-slate-200 p-8 text-center shadow-xs">
            <Ticket className="w-10 h-10 text-indigo-600 mx-auto" />
            <h3 className="mt-3 text-lg font-extrabold text-slate-900">
              Aún no tienes rifas creadas
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Crea tu primera rifa para generar su enlace público y empezar a recibir apartados.
            </p>
            <button
              type="button"
              onClick={() => {
                setEditingRaffle(null);
                setShowRaffleModal(true);
              }}
              className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2.5 text-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Crear primera rifa</span>
            </button>
          </div>
        )}

        {!loading && raffles.length > 0 && (
          <div className="grid gap-4 lg:grid-cols-2">
            {raffles.map((raffle) => {
              const statusBadge =
                raffle.status === 'active'
                  ? 'bg-emerald-100 text-emerald-800'
                  : raffle.status === 'draft'
                  ? 'bg-slate-200 text-slate-700'
                  : 'bg-amber-100 text-amber-900';
              const statusLabel =
                raffle.status === 'active'
                  ? 'Activa'
                  : raffle.status === 'draft'
                  ? 'Borrador'
                  : 'Cerrada';

              return (
                <article
                  key={raffle.id}
                  className="rounded-3xl bg-white border border-slate-200 p-5 shadow-xs flex flex-col justify-between gap-4"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className={`inline-block text-xs font-bold px-2.5 py-0.5 rounded-full ${statusBadge}`}>
                          {statusLabel}
                        </span>
                        <h3 className="mt-2 text-lg font-extrabold text-slate-900">
                          {raffle.name}
                        </h3>
                      </div>
                      <span className="text-sm font-extrabold text-indigo-700 bg-indigo-50 px-3 py-1 rounded-xl shrink-0">
                        {formatCop(raffle.ticketPriceCop)}
                      </span>
                    </div>

                    <p className="mt-1.5 text-sm font-semibold text-slate-700">
                      Premio: {raffle.prizeText}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>
                        {formatDateCo(raffle.drawDate)} · {raffle.lotteryName}
                      </span>
                    </p>
                    {raffle.winningNumber && (
                      <p className="mt-1.5 text-xs font-bold text-amber-800 flex items-center gap-1">
                        <Trophy className="w-3.5 h-3.5" />
                        <span>Número ganador registrado: {raffle.winningNumber}</span>
                      </p>
                    )}

                    <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-2.5">
                        <p className="text-[11px] font-bold text-emerald-800 uppercase">Pagados</p>
                        <p className="text-lg font-extrabold text-emerald-900">
                          {raffle.counts.paid}
                        </p>
                      </div>
                      <div className="rounded-xl bg-amber-50 border border-amber-100 p-2.5">
                        <p className="text-[11px] font-bold text-amber-800 uppercase">Pendientes</p>
                        <p className="text-lg font-extrabold text-amber-900">
                          {raffle.counts.pending}
                        </p>
                      </div>
                      <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-2.5">
                        <p className="text-[11px] font-bold text-indigo-800 uppercase">Recaudo</p>
                        <p className="text-sm sm:text-base font-extrabold text-indigo-900 truncate">
                          {formatCop(raffle.totalCollectedCop)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
                    <Link
                      to={`/admin/rifas/${raffle.id}`}
                      className="flex-1 min-w-[150px] text-center rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3.5 py-2.5 text-sm transition"
                    >
                      Administrar tablero
                    </Link>

                    <button
                      type="button"
                      onClick={() => handleCopyPublicLink(raffle.slug)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-700"
                    >
                      {copiedSlug === raffle.slug ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-600" />
                          <span>Copiado</span>
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
                        title="Abrir página pública"
                        className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white hover:bg-slate-50 p-2.5 text-slate-700"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Link>
                    )}

                    <button
                      type="button"
                      title="Editar rifa"
                      onClick={() => {
                        setEditingRaffle(raffle);
                        setShowRaffleModal(true);
                      }}
                      className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white hover:bg-slate-50 p-2.5 text-slate-700"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      title="Eliminar rifa"
                      onClick={() => handleDeleteRaffle(raffle)}
                      className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 p-2.5 text-slate-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      {showRaffleModal && (
        <RaffleFormModal
          initial={editingRaffle}
          onClose={() => setShowRaffleModal(false)}
          onSaved={() => {
            setShowRaffleModal(false);
            fetchRaffles();
          }}
        />
      )}

      {showPasswordModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-lg font-extrabold text-slate-900">Cambiar contraseña</h2>
              <button
                type="button"
                onClick={() => setShowPasswordModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleChangePassword} className="mt-4 space-y-4">
              {passwordError && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-800">
                  {passwordError}
                </div>
              )}
              <div>
                <label className="block text-sm font-bold text-slate-800 mb-1">
                  Contraseña actual
                </label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-800 mb-1">
                  Nueva contraseña (mínimo 8 caracteres)
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base"
                />
              </div>
              <button
                type="submit"
                disabled={passwordSaving}
                className="w-full rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold py-3 text-sm shadow"
              >
                {passwordSaving ? 'Actualizando...' : 'Guardar nueva contraseña'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
