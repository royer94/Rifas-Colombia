import { Link } from 'react-router-dom';
import { ArrowLeft, FileText, ShieldAlert, Ticket } from 'lucide-react';

export function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-50 pb-14">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link to="/" className="inline-flex items-center gap-2 text-slate-900 font-extrabold text-sm sm:text-base">
            <Ticket className="w-5 h-5 text-indigo-600" />
            <span>Rifas Colombia</span>
          </Link>

          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-3 py-2 text-xs sm:text-sm font-bold text-slate-700"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver al inicio</span>
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 pt-6 space-y-5">
        <section className="rounded-3xl bg-white border border-slate-200 p-6 sm:p-8 shadow-xs">
          <div className="flex items-center gap-2.5 text-indigo-700">
            <FileText className="w-6 h-6 shrink-0" />
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Políticas de Uso y Condiciones del Servicio
            </h1>
          </div>
          <p className="mt-2 text-xs sm:text-sm text-slate-500">
            Última actualización: noviembre de 2026 · Al utilizar <strong>Rifas Colombia</strong> (como organizador o como comprador/participante) aceptas íntegramente estas condiciones.
          </p>

          <div className="mt-5 rounded-2xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <p className="text-xs sm:text-sm text-amber-950 leading-relaxed">
              <strong>Aviso clave:</strong> Rifas Colombia es únicamente una{' '}
              <strong>herramienta tecnológica intermediaria</strong> para gestionar tableros en línea.{' '}
              <strong>No</strong> organizamos rifas, <strong>no</strong> recibimos dinero ni custodiamos pagos, y{' '}
              <strong>no</strong> garantizamos ni respondemos por la entrega o estado de los premios.
            </p>
          </div>

          <div className="mt-6 space-y-6 text-sm sm:text-base text-slate-700 leading-relaxed">
            <section className="space-y-2">
              <h2 className="text-lg font-extrabold text-slate-900">
                1. Naturaleza del servicio (intermediario tecnológico)
              </h2>
              <p>
                Rifas Colombia pone a disposición de los usuarios un software en línea para publicar tableros numéricos del 00 al 99, apartar puestos u oportunidades y llevar el control administrativo de participantes.
              </p>
              <p>
                La plataforma actúa exclusivamente como <strong>intermediario tecnológico</strong> entre la persona u organización que crea y administra la rifa (el <strong>Organizador</strong>) y la persona que elige y compra uno o varios números (el <strong>Participante</strong>). Rifas Colombia no es parte de la relación comercial, contractual ni promocional entre ambos.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-extrabold text-slate-900">
                2. Pagos, recaudo e impagos
              </h2>
              <p>
                Todos los pagos de los puestos u oportunidades se realizan <strong>directamente entre el Participante y el Organizador</strong> por los medios que el Organizador indique (Nequi, Daviplata, transferencia bancaria, llave, efectivo u otros). Rifas Colombia no procesa pagos, no cobra comisiones sobre boletas ni retiene dinero.
              </p>
              <p>
                En consecuencia, <strong>Rifas Colombia no se hace responsable</strong> por:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  <strong>Impagos o mora</strong> de los participantes que aparten números y no realicen el pago.
                </li>
                <li>
                  Pagos enviados a cuentas equivocadas, comprobantes falsos o errores en transferencias realizadas por el Participante.
                </li>
                <li>
                  Demoras del Organizador en confirmar un pago, liberaciones automáticas de números por vencimiento de tiempo o solicitudes de reembolso/devolución de dinero.
                </li>
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-extrabold text-slate-900">
                3. Entrega, integridad y estado de los premios
              </h2>
              <p>
                El <strong>Organizador</strong> de cada rifa es el único y exclusivo responsable de la existencia real, propiedad, legalidad, calidad, garantía y entrega oportuna del premio ofrecido.
              </p>
              <p>
                <strong>Rifas Colombia no se hace responsable bajo ninguna circunstancia</strong> si el Organizador:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>No entrega el premio al ganador, se rehúsa a entregarlo o desaparece después del sorteo.</li>
                <li>Entrega el premio de forma <strong>parcial o incompleta</strong>.</li>
                <li>Entrega un premio <strong>dañado, defectuoso, averiado, vencido o diferente</strong> al descrito o fotografiado en la publicación de la rifa.</li>
                <li>Modifica unilateralmente las condiciones o fecha del premio ofrecido.</li>
              </ul>
              <p>
                Recomendamos a los Participantes verificar siempre la identidad y confiabilidad del Organizador antes de enviar dinero.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-extrabold text-slate-900">
                4. Mecánica de sorteos y resultados
              </h2>
              <p>
                Cada rifa publicada indica una lotería colombiana de referencia y una fecha de sorteo para las dos últimas cifras del premio mayor. Rifas Colombia no opera ni certifica sorteos oficiales; cualquier aclaración sobre aplazamientos, verificación de resultados o validez de números corresponde directamente al Organizador.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-extrabold text-slate-900">
                5. Cumplimiento legal y uso prohibido
              </h2>
              <p>
                El Organizador declara y garantiza que cuenta con las autorizaciones, permisos o requisitos legales exigidos por la normativa colombiana aplicable para realizar su rifa o actividad promocional, y asume toda responsabilidad civil, administrativa o penal derivada de su organización.
              </p>
              <p>
                Está prohibido utilizar la plataforma para estafas, suplantación de identidad, actividades ilícitas o publicación de contenido ofensivo. Rifas Colombia podrá suspender o eliminar rifas y cuentas ante indicios o reportes fundados de fraude o abuso, sin perjuicio de las acciones legales pertinentes.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-extrabold text-slate-900">
                6. Tratamiento de datos personales
              </h2>
              <p>
                Los datos que suministran los Participantes al apartar números (nombre completo, celular/WhatsApp y dirección opcional) son recolectados únicamente para que el Organizador gestione la reserva, verifique el pago y contacte al ganador. En los tableros públicos activos nunca se muestran los datos personales de los compradores; cuando la rifa cierra con número ganador registrado, solo se muestra públicamente el nombre del ganador y nunca su celular ni dirección.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-extrabold text-slate-900">
                7. Limitación de responsabilidad y disponibilidad
              </h2>
              <p>
                La plataforma se presta «tal cual» y «según disponibilidad». Aunque aplicamos medidas técnicas para evitar duplicados en los números apartados y proteger la información, Rifas Colombia no garantiza disponibilidad ininterrumpida ni responde por fallas de conexión, interrupciones de internet o pérdidas indirectas derivadas del uso del servicio.
              </p>
            </section>
          </div>

          <div className="mt-8 pt-5 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-sm font-bold text-indigo-600 hover:text-indigo-800"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Volver a rifas activas</span>
            </Link>
            <Link
              to="/admin"
              className="text-sm font-semibold text-slate-600 hover:text-slate-900"
            >
              Ir al Panel de Administración
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
