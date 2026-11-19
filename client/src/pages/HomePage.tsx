import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Clock, Gift, ShieldCheck, Ticket, Trophy, UserCheck } from 'lucide-react';
import { SiteFooter } from '../components/SiteFooter';
import { apiFetch } from '../utils/api';
import { formatCop, formatDateCo, getDrawCountdown } from '../utils/format';

interface PublicRaffleSummary {
  id: number;
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
  status: 'active' | 'closed';
  winningNumber: string | null;
  counts: {
    available: number;
    pending: number;
    paid: number;
  };
}

export function HomePage() {
  const [raffles, setRaffles] = useState<PublicRaffleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    apiFetch<{ raffles: PublicRaffleSummary[] }>('/api/public/raffles')
      .then((res) => {
        if (active) setRaffles(res.raffles);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'No se pudieron cargar las rifas.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 via-white to-slate-50">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
              <Ticket className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-slate-900 leading-tight">Rifas Colombia</h1>
              <p className="text-xs text-slate-500">Dos últimas cifras · Fácil y transparente</p>
            </div>
          </div>

          <Link
            to="/admin"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:scale-[0.98] transition"
          >
            <ShieldCheck className="w-4 h-4 text-indigo-600" />
            <span>Panel Admin</span>
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <section className="rounded-3xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white p-6 sm:p-8 shadow-lg mb-8">
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Organiza y participa en rifas en línea
          </h2>
          <p className="mt-2 text-indigo-100 text-sm sm:text-base max-w-2xl">
            Elige tus números favoritos del 00 al 99 en tiempo real, apártalos sin crear cuenta y paga directamente al organizador.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              to="/admin"
              className="inline-flex items-center justify-center rounded-xl bg-white text-indigo-700 font-bold px-4 py-2.5 text-sm shadow hover:bg-indigo-50 transition"
            >
              Crear o administrar mi rifa
            </Link>
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-slate-900">Rifas disponibles</h3>
          </div>

          {loading && (
            <div className="grid gap-4 sm:grid-cols-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-44 rounded-2xl bg-white border border-slate-200 animate-pulse" />
              ))}
            </div>
          )}

          {error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800 text-sm">
              {error}
            </div>
          )}

          {!loading && !error && raffles.length === 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
              <p className="text-slate-700 font-semibold">Todavía no hay rifas activas publicadas.</p>
              <p className="text-slate-500 text-sm mt-1">
                Si eres organizador, entra al{' '}
                <Link to="/admin" className="text-indigo-600 font-semibold underline">
                  Panel de Administración
                </Link>{' '}
                para crear la primera rifa.
              </p>
            </div>
          )}

          {!loading && !error && raffles.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {raffles.map((raffle) => (
                <Link
                  key={raffle.id}
                  to={`/r/${raffle.slug}`}
                  className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:border-indigo-400 hover:shadow-md transition flex flex-col justify-between"
                >
                  <div>
                    {raffle.prizeImage && (
                      <div className="mb-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                        <img
                          src={raffle.prizeImage}
                          alt={`Premio: ${raffle.prizeText}`}
                          className="w-full h-40 object-contain mx-auto"
                        />
                      </div>
                    )}
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-lg font-extrabold text-slate-900 group-hover:text-indigo-700 transition">
                        {raffle.name}
                      </h4>
                      <span
                        className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${
                          raffle.status === 'active'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {raffle.status === 'active' ? 'Activa' : 'Cerrada'}
                      </span>
                    </div>

                    <div className="mt-3 space-y-1.5 text-sm text-slate-600">
                      <p className="flex items-center gap-2 font-semibold text-slate-800">
                        <Gift className="w-4 h-4 text-indigo-600 shrink-0" />
                        <span>{raffle.prizeText}</span>
                      </p>
                      <p className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                        <span>
                          {formatDateCo(raffle.drawDate)} · {raffle.lotteryName}
                        </span>
                      </p>
                      {(() => {
                        const countdown = getDrawCountdown(raffle.drawDate, raffle.status);
                        if (!countdown || raffle.status === 'closed') return null;
                        return (
                          <p className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-full">
                            <Clock className="w-3.5 h-3.5 shrink-0" />
                            <span>{countdown.label}</span>
                          </p>
                        );
                      })()}
                      {raffle.organizerName && (
                        <p className="flex items-center gap-2 text-xs text-slate-500">
                          <UserCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>
                            Organiza: <strong className="text-slate-700">{raffle.organizerName}</strong>
                          </span>
                        </p>
                      )}
                      {raffle.status === 'closed' && raffle.winningNumber && (
                        <p className="flex items-center gap-2 text-amber-800 font-bold">
                          <Trophy className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>Número ganador: {raffle.winningNumber}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-sm font-bold text-indigo-700">
                      {formatCop(raffle.ticketPriceCop)} / número
                    </span>
                    <span className="text-xs font-semibold text-slate-500">
                      {raffle.counts.available} disponibles
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>

      <SiteFooter className="max-w-5xl mx-auto px-4 py-8 mt-6 border-t border-slate-200" />
    </div>
  );
}
