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
- Image conversion reaches Ready.
- Rename succeeds; replacement retains its artifact id and changes persisted content.
- Model 2 reads the original reference through the workspace (`BLUE-ANCHOR-17`).
- Model 1 reads the replacement in the same conversation (`GREEN-ANCHOR-42`).
- Anonymous app file-management request returns HTTP 401; anonymous backend file listing is empty. Raw object links are public by the chosen storage policy.
- 85 offline tests, TypeScript and targeted lint pass. Source lint has eight existing warnings when gitignored `.local` tooling is excluded.

## External configuration repaired

The Vercel Production `NEXT_PUBLIC_CONVEX_SITE_URL` was incorrectly the app origin. It was corrected to `https://rapid-caiman-366.convex.site` from the owner's authoritative file. `SITE_URL` matches the app origin. The failed frontend was restored while diagnosing, then the corrected build passed session reconnect and real file operations. No auth code or user data was changed.

The UploadThing server token is a Production secret and remains in ignored `.env.local`. No credentials are in this report or source control.

## Remaining acceptance

Audio and scanned-PDF requests were rejected with HTTP 402. A controlled request returned: `This request requires at least $0.50 in balance for files`. Account balance was about $0.22 despite the key having over $2 remaining on its own cap. The owner will add credits; resume these checks afterward. Measured key-usage increase at this checkpoint: USD 0.014744335.

After media acceptance: remove verification fixtures with the required approval, confirm deletion refreshes workspace access, and record final deployment/source state. Only generated document/image fixtures and a public-domain speech test clip were used; no company documents were uploaded for testing.
