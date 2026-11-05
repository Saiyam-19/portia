import { createUploadthing, type FileRouter } from 'uploadthing/next';
import { UploadThingError, UTFiles } from 'uploadthing/server';
import { z } from 'zod';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { authHelpers } from '@/lib/auth/server';
import { trustedOrigin } from '@/lib/auth/origin';
import { artifactServer, processArtifact } from '@/lib/artifacts/server';
import { uploadError } from '@/lib/artifacts/shared';
import { deleteStoredFiles } from '@/lib/artifacts/storage';

const f = createUploadthing();
export const fileRouter = {
  artifactUploader: f({ blob: { maxFileSize: '16MB', maxFileCount: 4 } }, { awaitServerData: true })
    .input(z.object({ artifactId: z.string().optional() }))
    .middleware(async ({ req, input, files }) => {
      if (!trustedOrigin(req)) throw new UploadThingError('Forbidden');
      if (input.artifactId && files.length !== 1) throw new UploadThingError('Replace one file at a time.');
      for (const file of files) {
        const error = uploadError(file);
        if (error) throw new UploadThingError(error);
      }
      const target = await authHelpers().fetchAuthQuery(api.artifacts.uploadTarget, input.artifactId ? { artifactId: input.artifactId as Id<'artifacts'> } : {});
      const slots = target.artifactId ? [{ artifactId: target.artifactId, expectedRevision: target.expectedRevision }] : await authHelpers().fetchAuthMutation(api.artifacts.reserveUploads, { files: files.map(file => ({ name: file.name, mimeType: file.type, size: file.size })) });
      return { ownerId: target.ownerId, slots, [UTFiles]: files.map((file, index) => ({ ...file, customId: slots[index].artifactId })) };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      const { client, secret } = artifactServer();
      const target = metadata.slots.find(slot => slot.artifactId === file.customId);
      if (!target) throw new UploadThingError('The upload does not belong to this request.');
      const result = await client.mutation(api.artifacts.registerUpload, {
        secret, ownerId: metadata.ownerId, ...target, name: file.name, mimeType: file.type, size: file.size, fileKey: file.key,
      });
      if (!result) {
        await deleteStoredFiles([file.key]);
        throw new UploadThingError('The file was changed or deleted during upload. Please try again.');
      }
      if (result.started) await processArtifact(result.id, metadata.ownerId, result.revision);
      const saved = await client.query(api.artifacts.forServer, { secret, artifactId: result.id, ownerId: metadata.ownerId });
      return { id: saved._id as string, name: saved.name, mimeType: saved.mimeType, size: saved.size, revision: saved.revision, status: saved.status, error: saved.error ?? null };
    }),
} satisfies FileRouter;
export type UploadRouter = typeof fileRouter;
