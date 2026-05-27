import focusRaw from "../../backend/data/session_focus_topics.json";

export type FocusTopic = { id: string; label: string };

const table = focusRaw as Record<string, FocusTopic[]>;

export function topicsForTopic(topicId: string): FocusTopic[] {
  return table[topicId] ?? [];
}

export function resolveLabel(
  topicId: string,
  focusId: string,
): string | undefined {
  const trimmed = focusId.trim();
  if (!trimmed) return undefined;
  return table[topicId]?.find((t) => t.id === trimmed)?.label;
}
