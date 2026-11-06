# UploadThing attachment release verification

## Release

- App: https://portia-berthing.vercel.app
- UploadThing Free, public-by-link originals and Markdown views, explicitly approved by the owner. No paid storage upgrade.
- Existing libfx loop, five tools, Markdown workspace, memory behavior and cache-friendly append-only history retained.
- Provider generation requests capped at 8,192 output tokens after a real HTTP 402 preauthorization failure. The 400k context window, 25k compaction reserve and 300k compaction threshold remain unchanged.

## Verified live

- Existing signed-in account reused; no new accounts created.
- Upload, callback registration, storage read and persisted Markdown preview.
- Markdown, Word, two-sheet Excel and text PDF uploads reach Ready.
- Readable image and image-only scanned-PDF conversion reach Ready; both preserve `12.50 USD per GRT` and the `250 USD` minimum.
- Audio conversion reaches Ready with a faithful, timestamped transcript of the public-domain speech fixture.
- Rename succeeds; replacement retains its artifact id and changes persisted content.
- Model 2 reads the original reference through the workspace (`BLUE-ANCHOR-17`).
- Model 1 reads the replacement in the same conversation (`GREEN-ANCHOR-42`).
- Model 1 reads image, scanned-PDF and audio Markdown views together through one workspace tool step, returning the expected amounts and speech.
- Anonymous app file-management request returns HTTP 401; anonymous backend file listing is empty. An unsigned original-file URL returns HTTP 200, matching the approved public-by-link policy.
- 85 offline tests, TypeScript and targeted lint pass. Source lint has eight existing warnings when gitignored `.local` tooling is excluded.

## External configuration repaired

The Vercel Production `NEXT_PUBLIC_CONVEX_SITE_URL` was incorrectly the app origin. It was corrected to `https://rapid-caiman-366.convex.site` from the owner's authoritative file. `SITE_URL` matches the app origin. The failed frontend was restored while diagnosing, then the corrected build passed session reconnect and real file operations. No auth code or user data was changed.

The UploadThing server token is a Production secret and remains in ignored `.env.local`. No credentials are in this report or source control.

The owner subsequently authorized a new OpenRouter key from their credited account. It replaces the earlier provider key in ignored `.env.local` and Vercel Production. This explicit key change supersedes the provider key in the earlier environment reference file. Production deployment `dpl_AP1k9KGANLYZseBanuuPg2jhRTAD` is Ready, serves the canonical app URL, and contains source commit `0e1556364a326bd6199ac00c87dca50f12331866`. Its anonymous session endpoint returns HTTP 200/null, and the existing signed-in account successfully completes the live media checks.

## Credit gate and cleanup completed

The earlier audio and scanned-PDF HTTP 402 errors were caused by a wallet below the provider's $0.50 file-input minimum. Both pass using the newly authorized credited account. No credits or storage subscription were purchased by the agent.

With the owner's explicit cleanup approval, all seven generated verification artifacts were deleted through the app. UploadThing's file list then returned zero objects with no further pages, confirming originals and Markdown copies were removed. The formerly accessible original PDF URL returns HTTP 404.

Before removing the verification chat, Model 1 ran another workspace tool step and confirmed that all four previously attached Markdown paths no longer exist. The verification chat was then deleted; the three pre-existing chats remain. Temporary diagnostic probes were removed. No local application server was left running by this work.

Only generated document/image fixtures and a public-domain speech test clip were used; no company documents were uploaded for testing. All requested attachment acceptance checks are complete.
