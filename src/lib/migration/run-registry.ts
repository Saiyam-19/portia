import "server-only";

const activeRuns = new Map<string, AbortController>();

export function registerMigrationRun(runId: string, controller: AbortController): void {
  activeRuns.set(runId, controller);
}

export function unregisterMigrationRun(runId: string): void {
  activeRuns.delete(runId);
}

export function abortMigrationRun(runId: string): boolean {
  const controller = activeRuns.get(runId);
  if (!controller) return false;
  controller.abort(new DOMException("Stopped by user.", "AbortError"));
  activeRuns.delete(runId);
  return true;
}
