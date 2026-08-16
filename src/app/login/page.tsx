import Link from "next/link";
import { signIn } from "@/app/actions/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  return (
    <main className="flex-1 flex items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold mb-6">Inicia sesión en Brújula</h1>

        {message && (
          <p className="mb-4 rounded bg-blue-50 text-blue-700 text-sm p-3">
            {message}
          </p>
        )}
        {error && (
          <p className="mb-4 rounded bg-red-50 text-red-700 text-sm p-3">
            {error}
          </p>
        )}

        <form action={signIn} className="flex flex-col gap-4">
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
              className="border rounded px-3 py-2"
            />
          </label>

          <button
            type="submit"
            className="bg-black text-white rounded px-3 py-2 mt-2 hover:bg-gray-800"
          >
            Entrar
          </button>
        </form>

        <p className="text-sm text-gray-600 mt-4">
          ¿Todavía no tienes cuenta?{" "}
          <Link href="/signup" className="underline">
            Crea tu empresa
          </Link>
        </p>
      </div>
    </main>
  );
}
