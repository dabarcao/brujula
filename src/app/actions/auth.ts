"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signUp(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const orgName = String(formData.get("orgName") || "").trim();

  if (!email || !password || !orgName) {
    redirect("/signup?error=" + encodeURIComponent("Rellena todos los campos."));
  }

  const supabase = await createClient();

  const { error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Guardamos el nombre de empresa como metadata del usuario para poder
      // crear la organización en cuanto confirme su correo e inicie sesión
      // por primera vez (ver /dashboard).
      data: { pending_org_name: orgName },
    },
  });

  if (signUpError) {
    redirect("/signup?error=" + encodeURIComponent(signUpError.message));
  }

  // Con "confirm email" activado en Supabase, en este punto el usuario
  // todavía no tiene sesión activa hasta que confirme su correo, así que
  // la organización se crea la primera vez que inicia sesión con éxito
  // (ver /dashboard, que la crea si el usuario confirmado aún no la tiene).
  redirect(
    "/login?message=" +
      encodeURIComponent(
        `Te hemos enviado un correo a ${email} para confirmar tu cuenta. Después de confirmarlo, inicia sesión y crearemos "${orgName}".`
      ) +
      "&orgName=" +
      encodeURIComponent(orgName)
  );
}

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
