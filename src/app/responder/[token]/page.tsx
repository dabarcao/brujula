import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ResponderWizard from "@/components/ResponderWizard";

type Question = {
  id: string;
  prompt: string;
  required: boolean;
  question_type: string;
  max_selections: number | null;
};

type ScaleLevel = {
  level: number;
  label: string;
};

type CompetencyOption = {
  code: string;
  name: string;
};

type ResponderContext = {
  valid: boolean;
  used?: boolean;
  requires_login?: boolean;
  is_self?: boolean;
  questions?: Question[];
  scale_levels?: ScaleLevel[];
  competencies?: CompetencyOption[];
};

export default async function RespondPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();

  // Una invitación por email (cuenta individual, sin ningún miembro
  // registrado detrás) no exige sesión: el token es la única credencial.
  // Una invitación normal sí la exige — get_responder_context devuelve
  // requires_login en ese caso si nadie ha iniciado sesión, o si la
  // sesión iniciada no es la de esa persona.
  const { data: context } = await supabase.rpc("get_responder_context", {
    p_token: token,
  });

  const ctx = context as ResponderContext | null;

  if (ctx?.requires_login) {
    redirect("/login");
  }

  if (!ctx || !ctx.valid) {
    return (
      <main className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-sm text-center">
          <h1 className="text-xl font-semibold mb-2">No encontrada</h1>
          <p className="text-sm text-gray-600 mb-4">
            Esta invitación no existe o no te pertenece.
          </p>
          <Link href="/dashboard" className="underline text-sm">
            Volver al panel
          </Link>
        </div>
      </main>
    );
  }

  if (ctx.used) {
    return (
      <main className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-sm text-center">
          <h1 className="text-xl font-semibold mb-2">Ya has respondido</h1>
          <p className="text-sm text-gray-600 mb-4">Gracias por tu feedback.</p>
          <Link href="/dashboard" className="underline text-sm">
            Volver al panel
          </Link>
        </div>
      </main>
    );
  }

  const isSelf = Boolean(ctx.is_self);
  const questions = ctx.questions || [];
  const scaleLevels = ctx.scale_levels || [];
  const competencies = ctx.competencies || [];

  return (
    <main className="flex-1 p-8 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-semibold">
          {isSelf ? "Tu autoevaluación" : "Dar feedback"}
        </h1>
        <Link href="/dashboard" className="text-sm underline text-gray-600">
          Volver al panel
        </Link>
      </div>
      <p className="text-sm text-gray-600 mb-6">
        {isSelf
          ? "Esta es tu propia valoración: no es anónima, es tu punto de vista."
          : "Tu respuesta es anónima: ni la persona que la solicitó ni nadie más podrá saber que la escribiste tú."}
      </p>

      {error && (
        <p className="mb-6 rounded bg-red-50 text-red-700 text-sm p-3">{error}</p>
      )}

      <ResponderWizard
        token={token}
        questions={questions}
        scaleLevels={scaleLevels}
        competencies={competencies}
      />
    </main>
  );
}
