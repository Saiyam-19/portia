# Migration targets

Verified 2026-10-09. No secret values belong here.

| Item | Target |
| --- | --- |
| Base source revision | `ec30d1537edd5819b5c226e2ba670bf7bfba88ad`; implementation remains uncommitted |
| Attached migration checkout | `/Users/saiyamchaplot/.codex/worktrees/portia-convex-migration/portia-main` |
| Preserved original checkout | `/Users/saiyamchaplot/Documents/portia-main`; latest Codex UI copied through a bounded snapshot |
| Convex OAuth profile | `portia`, macOS Keychain via `cx` |
| Convex team / project | `o-one-labs` / `portia` (team ID `517665`) |
| Verified development deployment | `brilliant-whale-380`, US East |
| Development client / HTTP URLs | `https://brilliant-whale-380.convex.cloud` / `https://brilliant-whale-380.convex.site` |
| Verified local production-build preview | `http://127.0.0.1:3002/dashboard` |
| Existing Convex production deployment | `joyous-kookabura-196`; resolved read-only, not deployed by this task |
| Existing Vercel frontend | `saiyam-19s-projects/portia-berthing`, `prj_v64BgcSBNntGsXzTX8BhuuLIlhZ4` |
| Current public alias | `https://portia-berthing.vercel.app` |
| Legacy frontend release | `dpl_FihJLE9ynbJCo33zGERpSYAkzmRJ`, `https://portia-berthing-jajalm9td-saiyam-19s-projects.vercel.app` |
| Legacy Python project | `portia-berthing-api`, `prj_6rBntsYfn8N4urZQfacnIyojMNDa`; untouched |

Development uses `PORTIA_ENABLED=true`, an explicitly matching `PORTIA_CONVEX_DEPLOYMENT`, `PORTIA_AUTH_MODE=basic`, and `SITE_URL=http://127.0.0.1:3002`. The separate bridge/auth secrets remain private. Paid routing is enabled; free override is disabled. See [full acceptance](migration-acceptance.md).

Production cutover has not occurred. Before publishing, re-confirm the live account/project/deployment, recheck the source remains empty, set independent production secrets and the public frontend origin, deploy Convex before the matching Next.js build, and verify the exact public release. Before any new Convex user writes, the untouched legacy release is available. After Convex accepts writes, keep Convex authoritative and use a compatible Next.js rollback/fix-forward release; do not switch users back to stale Supabase data. Resource deletion is separate.

Port 3001 is no longer running. Current owned preview: PID 46681, PPID/PGID 46672, using `next start` from this worktree. Check `.local/full-migration-preview-process.json` and revalidate identity before cleanup. All unrelated applications were preserved.
