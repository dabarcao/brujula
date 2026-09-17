import Link from "next/link";
import { signIn } from "@/app/actions/auth";
import { buttonPrimaryClassName } from "@/components/ui/ButtonPrimary";
import ErrorBanner from "@/components/ui/ErrorBanner";
import { CompassBadge, CompassWatermark } from "@/components/ui/CompassBrand";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  return (
    <main
      className="flex-1 flex items-center justify-center p-8 relative overflow-hidden"
      style={{
        // Base wash muy sutil (investigación de fondos SaaS): rompe la
        // planitud del `paper` de página sin introducir un color nuevo --
        // solo los dos tonos de paper ya existentes en el sistema.
        background: "radial-gradient(120% 120% at 50% 42%, var(--paper-deep) 0%, var(--paper) 60%)",
      }}
    >
      {/* Relleno de las esquinas vacías (investigación de instrumentos
          HUD): curvas de nivel topográficas muy tenues, hechas con
          `repeating-radial-gradient` -- tres centros de "elevación"
          colocados lejos de la tarjeta, uno por tono ya existente
          (ink/indigo/indigo-deep -- actualizado en el rebrand 2026-09-17;
          antes tenía un azul y un dorado que ya no existen en la paleta),
          para que las esquinas dejen de leerse en blanco sin competir con
          la brújula. La viñeta va encima, en la misma capa, para seguir
          enfocando la mirada al centro (mismo recurso que HBO Max/Discord
          en sus pantallas de acceso). */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none select-none"
        style={{
          backgroundImage: [
            "radial-gradient(circle at 50% 50%, transparent 45%, rgba(28,32,58,0.07) 100%)",
            "repeating-radial-gradient(circle at 10% 15%, transparent 0px, transparent 42px, rgba(28,32,58,0.05) 43px, transparent 45px)",
            "repeating-radial-gradient(circle at 92% 85%, transparent 0px, transparent 58px, rgba(140,180,60,0.06) 59px, transparent 61px)",
            "repeating-radial-gradient(circle at 90% 10%, transparent 0px, transparent 50px, rgba(20,95,55,0.05) 51px, transparent 53px)",
            "repeating-radial-gradient(circle at 8% 90%, transparent 0px, transparent 46px, rgba(28,32,58,0.04) 47px, transparent 49px)",
          ].join(", "),
        }}
      />

      {/* Anclada a la esquina inferior derecha y sobredimensionada a
          propósito -- la mayor parte del disco sangra fuera del main
          (que tiene overflow-hidden); solo asoma el cuarto superior-
          izquierdo, lejos del centro donde vive la tarjeta, así el
          anillo/aguja nunca queda tapado. Opacidad por defecto del
          componente (0.07) -- esta pantalla ya estaba bien así, no se ha
          tocado; el resto de la app usa una más baja, ver
          src/app/dashboard/layout.tsx. */}
      <CompassWatermark
        className="absolute pointer-events-none select-none right-[-32%] bottom-[-28%] w-[170vw] max-w-none sm:w-[1500px] aspect-square -z-0"
      />

      <div className="w-full max-w-sm relative">
        <div className="flex flex-col items-center text-center mb-8 gap-3 bg-paper-deep/48 backdrop-blur-sm rounded-brujula-lg px-6 py-5">
          <CompassBadge />
          <h1 className="font-heading text-2xl text-ink">Inicia sesión en Brújula</h1>
          <p className="text-sm text-ink-soft">Encuentra tu rumbo, con feedback seguro.</p>
        </div>

        {message && (
          <p className="mb-6 rounded-brujula-md bg-indigo-wash text-indigo-deep text-sm p-3">
            {message}
          </p>
        )}
        {error && (
          <div className="bg-paper-deep/58 backdrop-blur-sm rounded-brujula-md">
            <ErrorBanner>{error}</ErrorBanner>
          </div>
        )}

        <div className="bg-paper-deep/58 backdrop-blur-sm rounded-brujula-lg shadow-card border border-line/40 p-8">
          <form action={signIn} className="flex flex-col gap-5">
            <label className="flex flex-col gap-1.5">
              <span className="text-caption font-caption uppercase tracking-wide text-ink-soft">
                Email
              </span>
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                className="border border-line rounded-brujula-md px-4 py-3 text-sm bg-paper text-ink placeholder:text-ink-soft transition-colors motion-safe:duration-150 focus:outline-none focus:border-indigo focus:ring-2 focus:ring-indigo-wash"
                placeholder="tu@empresa.com"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-caption font-caption uppercase tracking-wide text-ink-soft">
                Contraseña
              </span>
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="border border-line rounded-brujula-md px-4 py-3 text-sm bg-paper text-ink transition-colors motion-safe:duration-150 focus:outline-none focus:border-indigo focus:ring-2 focus:ring-indigo-wash"
              />
            </label>

            <button type="submit" className={`${buttonPrimaryClassName} w-full mt-2`}>
              Entrar
            </button>
          </form>
        </div>

        {/* La raíz del dominio (src/app/page.tsx) deja de enlazar /registro
            desde el rediseño -- sin este enlace, una cuenta individual no
            tenía ninguna forma de encontrar cómo darse de alta salvo
            escribiendo la URL de memoria. */}
        <p className="text-center text-sm text-ink-soft mt-6">
          ¿No tienes empresa?{" "}
          <Link href="/registro" className="text-ink underline">
            Crea tu cuenta individual
          </Link>
        </p>
      </div>
    </main>
  );
}
