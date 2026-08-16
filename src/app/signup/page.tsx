import Link from "next/link";
import { signUp } from "@/app/actions/auth";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex-1 flex items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold mb-1">Crea tu empresa en Brújula</h1>
        <p className="text-sm text-gray-600 mb-6">
          Tú serás el administrador de esta organización.
        </p>

        {error && (
          <p className="mb-4 rounded bg-red-50 text-red-700 text-sm p-3">
            {error}
          </p>
        )}

        <form action={signUp} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            Nombre de la empresa
            <input
              name="orgName"
              type="text"
              required
              className="border rounded px-3 py-2"
              placeholder="Mi Empresa S.L."
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Email
            <input
              name="email"
              type="email"
              required
              className="border rounded px-3 py-2"
              placeholder="tu@empresa.com"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Contraseña
            <input
              name="password"
              type="password"
              required
              minLength={8}
              className="border rounded px-3 py-2"
            />
          </label>

          <button
            type="submit"
            className="bg-black text-white rounded px-3 py-2 mt-2 hover:bg-gray-800"
          >
            Crear cuenta
          </button>
        </form>

        <p className="text-sm text-gray-600 mt-4">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="underline">
            Inicia sesión
          </Link>
        </p>
      </div>
    </main>
  );
}
