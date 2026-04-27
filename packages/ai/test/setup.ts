/**
 * Vitest global setup.
 *
 * Populate fake env BEFORE any @crdg/core module loads so that env.ts validation
 * passes. Tests should never make real network calls — Anthropic is mocked
 * via vi.mock and pgQuery is mocked per-test.
 */
process.env['SUPABASE_URL'] = process.env['SUPABASE_URL'] || 'http://localhost:54321';
process.env['SUPABASE_ANON_KEY'] = process.env['SUPABASE_ANON_KEY'] || 'test-anon';
process.env['SUPABASE_SERVICE_ROLE_KEY'] = process.env['SUPABASE_SERVICE_ROLE_KEY'] || 'test-svc';
process.env['SUPABASE_DB_URL'] = process.env['SUPABASE_DB_URL'] || 'postgresql://localhost:5432/test';
process.env['ANTHROPIC_API_KEY'] = process.env['ANTHROPIC_API_KEY'] || 'sk-ant-test-key';
process.env['NODE_ENV'] = 'test';
process.env['LOG_LEVEL'] = 'silent';
// Make sure tests never hit Voyage either
delete process.env['VOYAGE_API_KEY'];
