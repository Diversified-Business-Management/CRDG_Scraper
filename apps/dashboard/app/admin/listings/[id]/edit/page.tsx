/**
 * Admin master edit view — every editable field on canonical_listings,
 * grouped into collapsible sections matching the datagrid groups.
 * Save commits via PATCH /api/admin/listings/[id]; Delete via DELETE.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { EditForm } from './EditForm';
import { PhotoEditor, type PhotoLite } from './PhotoEditor';

export const dynamic = 'force-dynamic';

export default async function ListingEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from('canonical_listings')
    .select('*')
    .eq('id', id)
    .single();
  if (error || !data) notFound();

  const { data: photoRows } = await supabase
    .from('photos')
    .select('id, url_source, url_supabase, position, is_hero, is_rejected, reject_reason, alt_text_en, width, height, ai_validation_notes')
    .eq('canonical_listing_id', id)
    .order('position', { ascending: true });
  const photos = (photoRows ?? []) as PhotoLite[];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <Link href="/admin/data-grid" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to data grid
        </Link>
        <Link href={`/listings/${data['slug']}`} target="_blank" className="text-sm text-primary underline-offset-2 hover:underline">
          View public detail ↗
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{(data['title_en'] as string) || (data['title_es'] as string) || data['slug']}</h1>
        <p className="text-sm text-muted-foreground">
          ID: <span className="font-mono">{data['id'] as string}</span> · slug: <span className="font-mono">{data['slug'] as string}</span>
        </p>
      </div>
      <EditForm listing={data as Record<string, unknown>} />

      <div className="crdg-card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Photos</h2>
        <p className="mt-1 mb-4 text-xs text-muted-foreground">
          Hide a photo if you don&apos;t like it (it stays in the rejected bucket — restore anytime). Hero photo controls the listing&apos;s thumbnail. Drag-equivalent reorder via ↑ / ↓.
        </p>
        <PhotoEditor listingId={id} photos={photos} />
      </div>
    </div>
  );
}
