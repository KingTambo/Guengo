export function env(name: string): string | undefined {
  const v = process.env[name];
  if (!v) return undefined;
  const t = v.trim();
  return t.length ? t : undefined;
}

export function deploymentOrigin(): string {
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return (env("PUBLIC_APP_URL") ?? "http://127.0.0.1:8080").replace(/\/$/, "");
}
