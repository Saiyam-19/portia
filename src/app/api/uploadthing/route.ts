import { createRouteHandler } from 'uploadthing/next';
import { fileRouter } from './core';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const { GET, POST } = createRouteHandler({ router: fileRouter });
