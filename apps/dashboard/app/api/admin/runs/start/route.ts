import { NextResponse } from 'next/server';
import { z } from 'zod';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { getSessionUser } from '@/lib/auth';
import { createAdminSupabase } from '@/lib/supabase/admin';

const Body = z.object({
  source_id: z.string().uuid(),
  source_slug: z.string().optional(),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from('runs')
    .insert({
      source_id: parsed.data.source_id,
      trigger: 'manual',
      status: 'running',
    })
    .select('id')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 });
  }

  // Drop a sentinel file the worker can pick up
  try {
    const dir = join(homedir(), 'crdg-runs', 'queue');
    await mkdir(dir, { recursive: true });
    const payload = {
      run_id: data.id,
      source_id: parsed.data.source_id,
      source_slug: parsed.data.source_slug,
      requested_by: user.email,
      requested_at: new Date().toISOString(),
    };
    await writeFile(
      join(dir, `${data.id}.json`),
      JSON.stringify(payload, null, 2),
      'utf8'
    );
  } catch (err) {
    // Non-fatal: row still inserted. Worker can poll DB instead.
    console.warn('[runs/start] sentinel write failed:', err);
  }

  return NextResponse.json({ ok: true, run_id: data.id });
}
