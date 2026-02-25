export type ToolLabels = { inProgress: string; complete: string };

const VERB_FORMS: Record<string, [string, string]> = {
  send: ["Sending", "sent"],
  schedule: ["Scheduling", "scheduled"],
  create: ["Creating", "created"],
  search: ["Searching", "found"],
  read: ["Reading", "read"],
};

export function buildToolLabelMap(
  tools: Array<{ name: string; title?: string }>,
): Map<string, ToolLabels> {
  const map = new Map<string, ToolLabels>();
  for (const tool of tools) {
    map.set(tool.name, deriveLabels(tool.title ?? tool.name));
  }
  return map;
}

function deriveLabels(title: string): ToolLabels {
  const ARTICLES = new Set(["a", "an", "the"]);
  const words = title.split(" ").filter((w) => !ARTICLES.has(w.toLowerCase()));
  const [verb, ...rest] = words;
  const object = rest.join(" ");
  const [ingForm, pastForm] = VERB_FORMS[verb.toLowerCase()] ?? [
    `${verb}ing`,
    `${verb}ed`,
  ];
  const inProgress = object ? `${ingForm} ${object.toLowerCase()}` : ingForm;
  const complete = object
    ? `${object.charAt(0).toUpperCase()}${object.slice(1).toLowerCase()} ${pastForm}`
    : `${verb} ${pastForm}`;
  return { inProgress, complete };
}
