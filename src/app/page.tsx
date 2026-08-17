import Link from "next/link";

export default function Home() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Brújula</h1>
      <p className="max-w-md text-gray-600">
        Feedback anónimo entre compañeros, con orientación hacia la mejora.
      </p>
      <div className="flex gap-3 mt-2">
        <Link
          href="/login"
          className="bg-black text-white rounded px-4 py-2 text-sm hover:bg-gray-800"
        >
          Iniciar sesión
        </Link>
      </div>
    </main>
  );
}
