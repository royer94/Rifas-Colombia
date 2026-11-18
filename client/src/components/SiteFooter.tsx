import { Link } from 'react-router-dom';

export function SiteFooter({ className = '' }: { className?: string }) {
  return (
    <footer
      className={`text-center text-xs text-slate-600 leading-relaxed space-y-1.5 ${className}`}
    >
      <p>
        <strong>Rifas Colombia</strong> es únicamente una herramienta tecnológica intermediaria para gestionar tableros en línea.{' '}
        <strong>
          No organizamos rifas, no recibimos dinero ni custodiamos pagos, y no garantizamos ni respondemos por impagos ni por la entrega o estado de los premios.
        </strong>
      </p>
      <p>
        Más detalles en{' '}
        <Link to="/politicas" className="font-bold text-indigo-600 hover:text-indigo-800 underline">
          Políticas de uso y condiciones del servicio
        </Link>
        .
      </p>
    </footer>
  );
}
