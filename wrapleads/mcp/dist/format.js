/** Pretty-print an object as compact JSON for MCP text responses. */
export function json(data) {
    return JSON.stringify(data, null, 2);
}
/** Format a list of items with a summary header. */
export function listResult(label, items, total) {
    const count = total ?? items.length;
    return `${label}: ${count} result${count !== 1 ? 's' : ''}\n\n${json(items)}`;
}
/** Format a success confirmation. */
export function ok(message, data) {
    if (data === undefined)
        return `✓ ${message}`;
    return `✓ ${message}\n\n${json(data)}`;
}
//# sourceMappingURL=format.js.map