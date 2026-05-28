/** Developer-only session / Live API diagnostics (browser console). */
export function logSessionIssue(label: string, detail?: unknown): void {
  if (detail !== undefined) {
    console.warn(`[guengo:session] ${label}`, detail);
  } else {
    console.warn(`[guengo:session] ${label}`);
  }
}
