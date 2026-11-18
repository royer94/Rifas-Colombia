import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, ShieldCheck, UserPlus } from 'lucide-react';
import { ApiError, apiFetch } from '../utils/api';

export interface AdminProfile {
  id: number;
  username: string;
  displayName: string;
  mustChangePassword: boolean;
}

interface AdminLoginPageProps {
  onAuthenticated: (admin: AdminProfile) => void;
}

export function AdminLoginPage({ onAuthenticated }: AdminLoginPageProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const endpoint = mode === 'login' ? '/api/admin/auth/login' : '/api/admin/auth/register';
      const body =
        mode === 'login' ? { username, password } : { username, displayName, password };
      const res = await apiFetch<{ admin: AdminProfile }>(endpoint, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      onAuthenticated(res.admin);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('No se pudo conectar con el servidor.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-lg p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">Panel de Administración</h1>
            <p className="text-xs text-slate-500">Gestiona tus rifas, pagos y ganadores</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-xl mb-5">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError('');
            }}
            className={`rounded-lg py-2 text-sm font-bold transition ${
              mode === 'login' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Iniciar sesión
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError('');
            }}
            className={`rounded-lg py-2 text-sm font-bold transition ${
              mode === 'register' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Crear cuenta
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-sm font-semibold text-rose-800"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-800 mb-1">Usuario</label>
            <input
              type="text"
              required
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Ej: admin"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {mode === 'register' && (
            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1">
                Tu nombre o nombre del organizador
              </label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Ej: María Fernanda Gómez"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-bold text-slate-800 mb-1">Contraseña</label>
            <input
              type="password"
              required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'register' ? 'Mínimo 8 caracteres' : '••••••••'}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <p className="text-xs text-slate-500 text-center leading-relaxed">
            Al ingresar o crear una cuenta aceptas las{' '}
            <Link to="/politicas" className="font-bold text-indigo-600 underline">
              Políticas de uso
            </Link>{' '}
            y asumes la responsabilidad total por el recaudo y la entrega de los premios de tus rifas.
          </p>

          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-extrabold py-3 px-4 text-base shadow-md transition"
          >
            {mode === 'login' ? <Lock className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
            <span>
              {submitting
                ? 'Procesando...'
                : mode === 'login'
                ? 'Entrar al panel'
                : 'Crear cuenta y entrar'}
            </span>
          </button>
        </form>

        <div className="mt-5 pt-4 border-t border-slate-100 text-center">
          <Link to="/" className="text-sm font-semibold text-indigo-600 hover:text-indigo-800">
            ← Volver a las rifas públicas
          </Link>
        </div>
      </div>
    </div>
  );
}
