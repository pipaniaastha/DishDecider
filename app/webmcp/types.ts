// Minimal type shim for the emerging WebMCP spec's document.modelContext API.
// Chrome exposes this behind chrome://flags/#enable-webmcp-testing; ChatGPT's
// in-app browser supports it natively. This shim just gives us TS safety.

export interface WebMCPToolDefinition<TInput = any, TOutput = any> {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: TInput) => Promise<TOutput>;
}

export interface ModelContext {
  registerTool: (tool: WebMCPToolDefinition) => void;
  unregisterTool?: (name: string) => void;
}

declare global {
  interface Document {
    modelContext?: ModelContext;
  }
}

/** True if the current browser exposes the WebMCP model-context API. */
export function isWebMCPSupported(): boolean {
  return typeof document !== "undefined" && !!document.modelContext;
}
