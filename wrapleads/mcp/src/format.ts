/** Pretty-print an object as compact JSON for MCP text responses. */
export function json(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/** Format a list of items with a summary header. */
export function listResult(label: string, items: unknown[], total?: number): string {
  const count = total ?? items.length;
  return `${label}: ${count} result${count !== 1 ? 's' : ''}\n\n${json(items)}`;
}

/** Format a success confirmation. */
export function ok(message: string, data?: unknown): string {
  if (data === undefined) return `✓ ${message}`;
  return `✓ ${message}\n\n${json(data)}`;
}
