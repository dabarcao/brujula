import Link from "next/link";

export default function Home() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Brújula</h1>
      <p className="max-w-md text-gray-600">
        Feedback anónimo entre compañeros, con orientación hacia la mejora.
      </p>
      <div className="flex flex-col items-center gap-3 mt-2">
        <Link
          href="/registro"
          className="bg-black text-white rounded px-6 py-2.5 text-sm font-medium hover:bg-gray-800"
        >
          Regístrate
        </Link>
        <Link href="/login" className="text-sm underline text-gray-700">
          Iniciar sesión
        </Link>
        <a href="mailto:hola@brujula.app" className="text-xs text-gray-400 underline mt-2">
          ¿Eres una empresa? Contacta con nosotros
        </a>
      </div>
    </main>
  );
}
