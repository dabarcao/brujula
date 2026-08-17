"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function acceptInviteSignUp(formData: FormData) {
  const token = String(formData.get("token") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  if (!token || !email || !password) {
    redirect(
      `/invitacion/${token}?error=` + encodeURIComponent("Rellena todos los campos.")
    );
  }

  const supabase = await createClient();

  const { error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Igual que con pending_org_name (alta de empresa): hasta que el
      // usuario confirme su correo e inicie sesión por primera vez no
      // podemos vincular esta cuenta al "members" que ya creó RRHH (ver
      // /dashboard, que resuelve esto llamando a accept_member_invite).
      data: { pending_invite_token: token },
    },
  });

  if (signUpError) {
    redirect(`/invitacion/${token}?error=` + encodeURIComponent(signUpError.message));
  }

  redirect(
    "/login?message=" +
      encodeURIComponent(
        `Te hemos enviado un correo a ${email} para confirmar tu cuenta. Después de confirmarlo, inicia sesión para completar tu alta.`
      )
  );
}

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect("/login?error=" + encodeURIComponent(error.message));
  }

  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
