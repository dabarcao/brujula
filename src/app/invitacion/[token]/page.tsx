import Link from "next/link";
import { acceptInviteSignUp } from "@/app/actions/auth";
import * as responderManager from "@/server/managers/responderManager";

type InviteDetails = {
  organization_name: string;
  email: string;
  full_name: string | null;
  valid: boolean;
};

export default async function InvitationPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;

  let invite: InviteDetails | undefined;

  try {
    const rows = await responderManager.getInviteDetails(token);
    const row = rows[0];
    invite = row
      ? {
          organization_name: row.organizationName,
          email: row.email,
          full_name: row.fullName,
          valid: row.valid,
        }
      : undefined;
  } catch {
    // A malformed token (not UUID-shaped) makes the RPC throw via
    // db/responder.ts's error convention -- fall through to invalid.
    invite = undefined;
  }

  if (!invite || !invite.valid) {
    return (
      <main className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-sm text-center">
          <h1 className="text-xl font-semibold mb-2">Invitación no válida</h1>
          <p className="text-sm text-gray-600 mb-4">
            Este link de invitación no existe o ya se utilizó.
          </p>
          <Link href="/login" className="underline text-sm">
            Ir a iniciar sesión
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold mb-1">Únete a {invite.organization_name}</h1>
        <p className="text-sm text-gray-600 mb-6">
          Crea una contraseña para completar tu alta en Brújula.
        </p>

        {error && (
          <p className="mb-4 rounded bg-red-50 text-red-700 text-sm p-3">{error}</p>
        )}

        <form action={acceptInviteSignUp} className="flex flex-col gap-4">
          <input type="hidden" name="token" value={token} />

          <label className="flex flex-col gap-1 text-sm">
            Email
            <input
              value={invite.email}
              type="email"
              disabled
              className="border rounded px-3 py-2 bg-gray-50 text-gray-500"
            />
            <input type="hidden" name="email" value={invite.email} />
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
      </div>
    </main>
  );
}
