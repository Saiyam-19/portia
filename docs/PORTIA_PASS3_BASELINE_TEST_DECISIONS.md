Both failures reproduced before any pass3 production change (`output/pass3/baseline.log`).

1. **Missing Mumbai applicability: keep behavior; correct assertion.**
   The retained component rule is dated. `extendedComponents` in
   `src/lib/migration/reviewed-components.ts` checks the call date before calculating.
   The user supplied 50,000 GRT but no date. Asking for the missing date is correct;
   the old generic “requested scope / governing source” regex was stale.
   Test now requires “call date”, rejects asking again for tonnage/rates, retains
   the single model-call check, and forbids both INR and USD amounts.

2. **Empty BPCL asset: keep behavior; correct assertion.**
   “no verified tariff yet” is the user-required authority-gap response.
   The old “not yet available” text check predates that requirement.
   Test retains no-specialist/no-amount checks and adds no request for a rate.

No production behavior changed for these two assertions. Legacy mode remains explicit.
