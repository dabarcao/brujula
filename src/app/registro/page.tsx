import Link from "next/link";
import { individualSignUp } from "@/app/actions/auth";
import { buttonPrimaryClassName } from "@/components/ui/ButtonPrimary";
import ErrorBanner from "@/components/ui/ErrorBanner";

export default async function RegistroPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex-1 flex items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-8 gap-3">
          <h1 className="font-heading text-2xl text-ink">Crea tu cuenta</h1>
          <p className="text-sm text-ink-soft">
            Para ti, no para tu empresa — pide y recibe feedback anónimo de
            quien tú elijas.
          </p>
        </div>

        {error && <ErrorBanner>{error}</ErrorBanner>}

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
