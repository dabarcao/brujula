// Story 3.2 (_bmad-output/implementation-artifacts/
// spec-3-2-db-access-manager-scaffolding-admin-members-auth.md): db-access
// layer wrapping the two Supabase Auth SDK calls signIn/signOut actually
// make (confirmed via `grep supabase.auth.` -- only signInWithPassword/
// signOut/getUser/signUp exist anywhere; signUp belongs to
// acceptInviteSignUp/individualSignUp, out of scope for this story, same as
// Story 1.2 leaving src/lib/aiInterpretation.ts's untouched half alone).
// Mirrors Story 1.2's src/server/db/reportGroups.ts shape: this file is
// deliberately the only new code for this domain that constructs a Supabase
// client; every exported function is plain-TypeScript typed (no
// PostgrestError/AuthError/raw SupabaseClient/User, in any signature).
//
// Read-only reference this was wrapped from: src/app/actions/auth.ts's
// signIn/signOut (unmodified by this story -- it keeps calling
// supabase.auth.* directly until Story 3.4 refactors it to delegate here).

import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Wraps `supabase.auth.signInWithPassword`. Throws the Auth SDK's own
 * error message on failure (e.g. invalid credentials). Returns only the
 * authenticated user's id -- callers that need the app token issue it
 * themselves (see authManager.signIn) via @/server/shared/auth's
 * signAppToken, not this function.
 */
export async function signInWithPassword(email: string, password: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  return data.user.id;
}

/**
 * Wraps `supabase.auth.signOut`. Deliberately branch-free -- mirrors
 * src/app/actions/auth.ts's own signOut, which never checks the SDK call's
 * error return (an unconditional, always-resolves shape, per this story's
 * I/O matrix: "resolves, no error").
 */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
}

export type CurrentUser = {
  id: string;
  email: string | undefined;
};

/**
 * Story 6.3 (session-resolution completion, _bmad-output/
 * implementation-artifacts/spec-6-3-*.md): wraps `supabase.auth.getUser()`
 * -- the one Supabase call nearly every page in this app made directly,
 * since no domain migration story ever claimed "who is logged in" as its
 * own scope (it's cross-cutting session infrastructure, not one domain's
 * business data). Returns `null` instead of throwing when there is no
 * session, matching every call site's own existing `if (!user)
 * redirect("/login")` pattern -- never a distinct "not logged in" error
 * shape, unlike this file's other functions (which is deliberate: `signIn`/
 * `signOut` describe *actions* that can fail, but "no session" here is
 * routine, expected page-render state, not a failure).
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { id: user.id, email: user.email };
}

export type CurrentUserWithMetadata = CurrentUser & {
  pendingInviteToken: string | null;
  pendingIndividualSignup: boolean;
  fullName: string | null;
};

/**
 * Members/self/reports domain migration (dashboard/page.tsx's own
 * bootstrap block): like `getCurrentUser`, but also surfaces the three
 * `user_metadata` fields that block reads directly off the raw Supabase
 * Auth `User` object -- `pending_invite_token`, `pending_individual_signup`,
 * `full_name` -- stashed there at signup time by
 * `signUpWithInviteToken`/`signUpIndividualAccount` below (via
 * actions/auth.ts's acceptInviteSignUp/individualSignUp) and consumed
 * exactly once, on the visit right after the user confirms their email and
 * logs in for the first time. A separate function rather than widening
 * `getCurrentUser` itself: every other call site only ever reads
 * `id`/`email`, and `getCurrentUser`'s own doc comment already commits it
 * to being the "every page can call this" universal shape -- growing it
 * for one page's one-time bootstrap fields would make every other caller
 * carry dead weight. Same "no session -> null, never throws" contract as
 * `getCurrentUser`.
 */
export async function getCurrentUserWithMetadata(): Promise<CurrentUserWithMetadata | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    pendingInviteToken: (user.user_metadata?.pending_invite_token as string | undefined) ?? null,
    pendingIndividualSignup: Boolean(user.user_metadata?.pending_individual_signup),
    fullName: (user.user_metadata?.full_name as string | undefined) ?? null,
  };
}

/**
 * Wraps `supabase.auth.signUp` for the accept-invite signup flow
 * (actions/auth.ts's acceptInviteSignUp). Stashes `pending_invite_token` in
 * the new auth user's `user_metadata`, exactly as
 * `getCurrentUserWithMetadata` above expects to find it once the user
 * confirms their email and logs in -- `dashboard/page.tsx`'s bootstrap
 * block then calls `membersManager.acceptInvite(token)` to finish linking
 * the account. Throws the Auth SDK's own error message unmodified on
 * failure (e.g. duplicate email).
 */
export async function signUpWithInviteToken(
  email: string,
  password: string,
  inviteToken: string
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { pending_invite_token: inviteToken } },
  });
  if (error) throw new Error(error.message);
}

/**
 * Wraps `supabase.auth.signUp` for the individual-account signup flow
 * (actions/auth.ts's individualSignUp). Stashes `pending_individual_signup`
 * + `full_name` in `user_metadata` for the same
 * `getCurrentUserWithMetadata`-driven dashboard bootstrap to pick up --
 * which then calls `membersManager.createIndividualAccount`. Throws the
 * Auth SDK's own error message unmodified on failure.
 */
export async function signUpIndividualAccount(
  email: string,
  password: string,
  fullName: string
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { pending_individual_signup: true, full_name: fullName } },
  });
  if (error) throw new Error(error.message);
}
