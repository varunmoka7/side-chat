export type SideTurn = { q: string; a: string }

declare module 'claude-code' {
  interface PluginState {
    'side-chat': { turns: SideTurn[]; pending: string; model: string }
  }
}
