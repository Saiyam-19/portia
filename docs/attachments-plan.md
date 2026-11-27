# Attachments and artifacts

**Scope:** UploadThing, attachments in the existing composer, an Artifacts page
for upload/preview/download/rename/replace/delete, and Markdown access through
existing just-bash. Keep libfx, memory and append-only conversation caching.

## Implementation

- UploadThing Free with default public-by-link storage, explicitly approved by
  the owner. Originals and Markdown text views are accessible to anyone holding
  their object URL. The upload UI discloses this. No paid upgrade or ACL override.
- Existing login controls file management, metadata and attachment selection.
  Owner-scoped Convex metadata records storage keys, status and revisions.
- Text/PDF/Word/Excel convert locally. Images, audio and scanned PDFs use one
  bounded native multimodal conversion when live inference is configured.
  Conversion is an upload helper, not another agent or conversation loop.
- Owned, ready files attach to turns; display references persist. Only changed
  references append to new model input, never file contents or signed URLs in
  the system prompt.
- Read-only `/files/<id>.md` mounts refresh replacements/deletions before bash
  commands. Existing memory behavior remains intact.
- Existing Arc/shadcn app controls provide uploads, attachment chips, a saved-file
  picker and the Artifacts page. No unrelated UI or architecture changes.

## Verification

Node 24.19.0: 85 tests pass, including a libfx turn reading an attachment through
bash. TypeScript and the local production build passed for the initial implementation.
Source lint passes; existing gitignored `.local` release bundles must be excluded
(`bun run lint --ignore-pattern '.local/**'`). Eight existing source warnings.
Desktop/mobile light/dark fixtures exercised upload selection, attachment-only
send, preview, rename, search, retry, deletion and error recovery.

## Release status

The UploadThing key was created, authenticated and saved in `.env.local`; it is
now also a Vercel Production secret. Required Convex Production settings match
the owner's environment reference. The owner later authorized a new provider
key from a credited OpenRouter account; it is installed locally and in
Production. The release is live, with real upload/callback, agent-access,
replacement, multimodal and deletion checks passing. Verification files and
their storage copies were removed with approval; the existing agent workspace
confirmed the deleted mounts were gone. The verification chat was then removed.
No paid UploadThing upgrade.

Live acceptance evidence is in [attachments-live-verification.md](attachments-live-verification.md).
