# Agent reliability fixes

Goal: answer supplied-rate arithmetic without a port, handle ambiguous/mixed-zone dates, and recover from forms without unnecessary model calls. Keep original evaluation inputs byte-for-byte unchanged and paid verification narrow.

Baseline: isolated worktree at b64420fcfe0eea206918bfb34cf9cf38112b8302. Existing main-checkout audit changes remain untouched. Graph discovery located the agent, chat route and form lifecycle; worktree indexing failed safely because daemon coordination could not be verified, so exact worktree source is the authority.

1. Add main-agent calculator tools and a validated elapsed-time tool. Strengthen task ordering so independent facts are answered before tariff-coverage refusal; clarify ambiguous numeric dates before interpreting them. Regression tests must fail first for missing main-agent tool access and exercise ambiguity, invalid dates, offsets and reversed chronology.
2. Complete empty form cancellation through the existing authenticated/fenced persistence bridge with a deterministic acknowledgement, without creating a model. Preserve notes and use inference for an actual correction. Keep the composer available while a form is pending, carrying free-text corrections through the existing form-resolution contract. Test persistence failure, replay, draft handling, and visible correction entry.
3. Run focused local tests, typecheck, lint, and appropriate neighboring checks before paid testing. Reuse installed compatible dependencies; document any difference from the production lockfile. Do not create duplicate servers.
4. User subsequently requested implementation only: do not deploy or rerun live scenarios. Keep the original report unchanged. Future acceptance, if requested, should use original cases 5, 9, 10 and 19 with a bounded paid-call budget. General provider timeout elimination is not established by the form-cancellation fix.

Status: implemented and integrated into the primary checkout without replacing the earlier audit work. The isolated patch passed 173 tests; combined checkout passed 280 tests, TypeScript and focused lint. Original input SHA-256 remains 25aa0523922b5b60eed304a52282ee1111e94dbf7568559ac745ef4ec86c0592. Production and Convex deployments are unchanged. No tariff expansion, model change, automatic paid retries, or unrelated audit rollout in scope.

Local build: Next.js --webpack passed. Default Turbopack was blocked by the local worker-port restriction; project bundler configuration remains unchanged. Temporary worktree archived after integration.
