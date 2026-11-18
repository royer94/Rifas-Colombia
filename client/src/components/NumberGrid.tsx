import { CheckCircle2, Clock, Sparkles, Trophy } from 'lucide-react';

export type NumberStatus = 'available' | 'pending' | 'paid';

export interface GridNumberItem {
  number: string;
  status: NumberStatus;
}

interface NumberGridProps {
  numbers: GridNumberItem[];
  selectedNumbers?: string[];
  winningNumber?: string | null;
  disabled?: boolean;
  allowClickTaken?: boolean;
  activeInspectNumber?: string | null;
  onNumberClick: (item: GridNumberItem) => void;
}

export function NumberGrid({
  numbers,
  selectedNumbers = [],
  winningNumber = null,
  disabled = false,
  allowClickTaken = false,
  activeInspectNumber = null,
  onNumberClick,
}: NumberGridProps) {
  const selectedSet = new Set(selectedNumbers);

  return (
    <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 sm:gap-2.5">
      {numbers.map((item) => {
        const isSelected = selectedSet.has(item.number);
        const isWinner = winningNumber === item.number;
        const isInspected = activeInspectNumber === item.number;
        const isTaken = item.status !== 'available';
        const isClickable = !disabled && (allowClickTaken || !isTaken);

        let containerClasses =
          'bg-white border-slate-300 text-slate-900 hover:border-indigo-500 hover:bg-indigo-50/40 active:scale-[0.97]';
        let statusLabel = 'Disponible';

        if (item.status === 'pending') {
          containerClasses =
            'bg-amber-100 border-amber-400 text-amber-950 ' +
            (allowClickTaken ? 'hover:bg-amber-200 active:scale-[0.97]' : 'cursor-not-allowed opacity-95');
          statusLabel = 'Pendiente de pago';
        } else if (item.status === 'paid') {
          containerClasses =
            'bg-emerald-100 border-emerald-500 text-emerald-950 ' +
            (allowClickTaken ? 'hover:bg-emerald-200 active:scale-[0.97]' : 'cursor-not-allowed opacity-95');
          statusLabel = 'Pagado';
        } else if (isSelected) {
          containerClasses =
            'bg-indigo-600 border-indigo-700 text-white shadow-md ring-2 ring-indigo-300 active:scale-[0.97]';
          statusLabel = 'Seleccionado';
        }

        if (isWinner) {
          containerClasses += ' ring-4 ring-yellow-400 border-yellow-600';
        } else if (isInspected) {
          containerClasses += ' ring-2 ring-slate-900';
        }

        return (
          <button
            key={item.number}
            type="button"
            disabled={!isClickable}
            onClick={() => isClickable && onNumberClick(item)}
            aria-label={`Número ${item.number}: ${statusLabel}`}
            aria-pressed={isSelected}
            className={`relative flex flex-col items-center justify-center rounded-xl border-2 min-h-[54px] sm:min-h-[58px] px-1 py-1.5 transition select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${containerClasses}`}
          >
            <span className="text-base sm:text-lg font-extrabold tracking-tight tabular-nums leading-none">
              {item.number}
            </span>

            <span className="mt-1 flex items-center gap-0.5 text-[10px] font-semibold leading-none">
              {item.status === 'pending' && (
                <>
                  <Clock className="w-3 h-3 shrink-0" aria-hidden="true" />
                  <span>Pend.</span>
                </>
              )}
              {item.status === 'paid' && (
                <>
                  <CheckCircle2 className="w-3 h-3 shrink-0" aria-hidden="true" />
                  <span>Pago</span>
                </>
              )}
              {item.status === 'available' && isSelected && (
                <>
                  <Sparkles className="w-3 h-3 shrink-0" aria-hidden="true" />
                  <span>Elegido</span>
                </>
              )}
              {item.status === 'available' && !isSelected && (
                <span className="text-slate-400 font-medium">Libre</span>
              )}
            </span>

            {isWinner && (
              <span
                title="Número ganador"
                className="absolute -top-2 -right-2 bg-yellow-400 text-yellow-950 rounded-full p-1 shadow border border-yellow-600"
              >
                <Trophy className="w-3 h-3" aria-hidden="true" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function NumberLegend({
  available,
  pending,
  paid,
}: {
  available: number;
  pending: number;
  paid: number;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-white border border-slate-200 rounded-2xl p-3.5 shadow-xs">
      <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm font-medium text-slate-700">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-4 h-4 rounded-md bg-white border-2 border-slate-300 inline-block" />
          Disponible
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-4 h-4 rounded-md bg-amber-100 border-2 border-amber-400 inline-flex items-center justify-center text-amber-900">
            <Clock className="w-2.5 h-2.5" />
          </span>
          Apartado (pendiente)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-4 h-4 rounded-md bg-emerald-100 border-2 border-emerald-500 inline-flex items-center justify-center text-emerald-900">
            <CheckCircle2 className="w-2.5 h-2.5" />
          </span>
          Pagado
        </span>
      </div>

      <div className="text-xs sm:text-sm font-semibold text-slate-700 bg-slate-100 rounded-xl px-3 py-1.5 self-start sm:self-auto">
        <span className="text-slate-900">{available}</span> disponibles /{' '}
        <span className="text-amber-800">{pending}</span> apartados /{' '}
        <span className="text-emerald-800">{paid}</span> pagados
      </div>
    </div>
  );
}
