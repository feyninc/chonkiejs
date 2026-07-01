import { createFromSource } from 'fumadocs-core/search/server';
import { source } from '@/lib/source';

export const dynamic = 'force-static';

const server = createFromSource(source);

export const { staticGET: GET } = server;
