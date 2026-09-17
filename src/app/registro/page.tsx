import Link from "next/link";
import { individualSignUp } from "@/app/actions/auth";
import { buttonPrimaryClassName } from "@/components/ui/ButtonPrimary";
import ErrorBanner from "@/components/ui/ErrorBanner";
import { CompassBadge, CompassWatermark } from "@/components/ui/CompassBrand";

export default async function RegistroPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main
      className="flex-1 flex items-center justify-center p-8 relative overflow-hidden"
      style={{
        background: "radial-gradient(120% 120% at 50% 42%, var(--paper-deep) 0%, var(--paper) 60%)",
      }}
    >
      {/* Mismo fondo/marca que /login (src/components/ui/CompassBrand.tsx) -- consistencia entre las dos pantallas de acceso. */}
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

      <CompassWatermark
        className="absolute pointer-events-none select-none right-[-32%] bottom-[-28%] w-[170vw] max-w-none sm:w-[1500px] aspect-square -z-0"
      />

      <div className="w-full max-w-sm relative">
        <div className="flex flex-col items-center text-center mb-8 gap-3 bg-paper-deep/48 backdrop-blur-sm rounded-brujula-lg px-6 py-5">
          <CompassBadge />
          <h1 className="font-heading text-2xl text-ink">Crea tu cuenta</h1>
          <p className="text-sm text-ink-soft">
            Para ti, no para tu empresa — pide y recibe feedback anónimo de
            quien tú elijas.
          </p>
        </div>

        {error && (
          <div className="bg-paper-deep/58 backdrop-blur-sm rounded-brujula-md">
            <ErrorBanner>{error}</ErrorBanner>
          </div>
        )}

        <div className="bg-paper-deep/58 backdrop-blur-sm rounded-brujula-lg shadow-card border border-line/40 p-8">
          <form action={individualSignUp} className="flex flex-col gap-5">
            <label className="flex flex-col gap-1.5">
              <span className="text-caption font-caption uppercase tracking-wide text-ink-soft">
                Nombre
              </span>
              <input
                name="fullName"
                type="text"
                required
                autoComplete="name"
                className="border border-line rounded-brujula-md px-4 py-3 text-sm bg-paper text-ink placeholder:text-ink-soft transition-colors motion-safe:duration-150 focus:outline-none focus:border-indigo focus:ring-2 focus:ring-indigo-wash"
              />
            </label>

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
                placeholder="tu@email.com"
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
                minLength={8}
                autoComplete="new-password"
                className="border border-line rounded-brujula-md px-4 py-3 text-sm bg-paper text-ink transition-colors motion-safe:duration-150 focus:outline-none focus:border-indigo focus:ring-2 focus:ring-indigo-wash"
              />
            </label>

            <button type="submit" className={`${buttonPrimaryClassName} w-full mt-2`}>
              Crear cuenta
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-ink-soft mt-6">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="text-ink underline">
            Inicia sesión
          </Link>
        </p>
      </div>
    </main>
  );
}
