-- Stripe / premium + readiness step after MC quiz
alter table public.profiles
  add column if not exists onboarding_quiz_completed_at timestamptz,
  add column if not exists readiness_completed_at timestamptz,
  add column if not exists is_premium boolean not null default false,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_subscription_status text;

comment on column public.profiles.is_premium is 'True when Stripe subscription is active/trialing (webhook-updated).';
comment on column public.profiles.readiness_completed_at is 'User tapped Commencer after quiz; then paywall or app.';
comment on column public.profiles.onboarding_quiz_completed_at is 'Last onboarding MC question saved.';

-- Legacy rows: treat old onboarding_completed_at as quiz+readiness done.
update public.profiles
set
  onboarding_quiz_completed_at = coalesce(onboarding_quiz_completed_at, onboarding_completed_at),
  readiness_completed_at = coalesce(readiness_completed_at, onboarding_completed_at)
where onboarding_completed_at is not null;
