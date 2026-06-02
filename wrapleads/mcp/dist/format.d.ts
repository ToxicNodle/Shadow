/** Pretty-print an object as compact JSON for MCP text responses. */
export declare function json(data: unknown): string;
/** Format a list of items with a summary header. */
export declare function listResult(label: string, items: unknown[], total?: number): string;
/** Format a success confirmation. */
export declare function ok(message: string, data?: unknown): string;
