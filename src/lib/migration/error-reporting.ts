/** Provider errors can contain full prompts and headers; log only an HTTP code. */
export function reportMigrationStreamError({ error }: { error: unknown }): void {
  const code = error && typeof error === "object" && "statusCode" in error
    ? error.statusCode
    : null;
  console.warn("migration_inference_error", {
    statusCode: typeof code === "number" && Number.isInteger(code) ? code : null,
  });
}
