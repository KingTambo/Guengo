import type { SupabaseClient } from "@supabase/supabase-js";

export type ProfileGateRow = {
  onboarding_quiz_completed_at: string | null;
  readiness_completed_at: string | null;
  onboarding_completed_at: string | null;
  is_premium: boolean;
  onboarding_answers: Record<string, string> | null;
};

/** Profil marqué terminé en base, ou les deux étapes locales sont cochées. */
export function isOnboardingComplete(row: ProfileGateRow): boolean {
  return Boolean(
    row.onboarding_completed_at ||
      (row.onboarding_quiz_completed_at && row.readiness_completed_at),
  );
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchGateProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<ProfileGateRow | null> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "onboarding_quiz_completed_at, readiness_completed_at, onboarding_completed_at, is_premium, onboarding_answers",
      )
      .eq("id", userId)
      .maybeSingle();

    if (error) throw error;
    if (data) {
      const row = data as ProfileGateRow;
      const answers =
        row.onboarding_answers &&
        typeof row.onboarding_answers === "object" &&
        !Array.isArray(row.onboarding_answers)
          ? { ...row.onboarding_answers }
          : {};
      return { ...row, onboarding_answers: answers };
    }
    await sleep(350);
  }
  return null;
}
