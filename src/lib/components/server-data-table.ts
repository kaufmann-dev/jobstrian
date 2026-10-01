import { tableFeatures, type ColumnDef, type RowData } from '@tanstack/svelte-table';

/** Server-driven lists sort, filter, and paginate on the server, so only the core row model is used. */
export const serverTableFeatures = tableFeatures({});

export type ServerColumnDef<TData extends RowData> = ColumnDef<typeof serverTableFeatures, TData>;
