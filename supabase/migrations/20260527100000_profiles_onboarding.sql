-- Onboarding questionnaire answers + completion marker (profiles row per user).
alter table public.profiles
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists onboarding_answers jsonb not null default '{}'::jsonb;

comment on column public.profiles.onboarding_completed_at is 'Set when user finishes last onboarding step; null means show onboarding.';
comment on column public.profiles.onboarding_answers is 'Multiple-choice keys from onboarding wizard (structured JSON).';
