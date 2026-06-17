import Anthropic from '@anthropic-ai/sdk';
import { env } from './env.js';
import { ModelPricing, type SupportedModel } from './limits.js';
import { logger } from './logger.js';
import { pgQuery } from './supabase.js';

const client = new Anthropic({ apiKey: env.anthropic.apiKey });

export class BudgetExceededError extends Error {
  constructor(public limit: number, public actual: number, public scope: 'run' | 'day') {
    super(`Anthropic budget exceeded: $${actual.toFixed(4)} > $${limit.toFixed(2)} (${scope})`);
    this.name = 'BudgetExceededError';
  }
}

interface BudgetTrackerOpts {
  runId?: string | null;
  perRunCapUsd?: number;
  perDayCapUsd?: number;
}

class BudgetTracker {
  private runSpend = 0;
  private daySpend = 0;
  private dayLoaded = false;

  constructor(private opts: BudgetTrackerOpts) {}

  private async ensureDayLoaded() {
    if (this.dayLoaded) return;
    const rows = await pgQuery<{ cost_usd: string }>(
      `select coalesce(sum(cost_usd),0)::text as cost_usd from runs where started_at >= date_trunc('day', now())`
    );
    this.daySpend = Number(rows[0]?.cost_usd ?? 0);
    this.dayLoaded = true;
  }

  /** throws BudgetExceededError if charging this amount would exceed any cap */
  async preflight(estimatedUsd: number) {
    await this.ensureDayLoaded();
    const runCap = this.opts.perRunCapUsd ?? env.anthropic.budgetPerRunUsd;
    const dayCap = this.opts.perDayCapUsd ?? env.anthropic.budgetPerDayUsd;
    if (this.runSpend + estimatedUsd > runCap)
      throw new BudgetExceededError(runCap, this.runSpend + estimatedUsd, 'run');
    if (this.daySpend + estimatedUsd > dayCap)
      throw new BudgetExceededError(dayCap, this.daySpend + estimatedUsd, 'day');
  }

  charge(usd: number) {
    this.runSpend += usd;
    this.daySpend += usd;
  }

  get totalRunUsd() { return this.runSpend; }
  get totalDayUsd() { return this.daySpend; }
}

let _globalTracker: BudgetTracker | null = null;
export function getBudgetTracker(): BudgetTracker {
  if (!_globalTracker) _globalTracker = new BudgetTracker({});
  return _globalTracker;
}
export function resetBudgetTracker() { _globalTracker = new BudgetTracker({}); }

export interface AnthropicCallOpts {
  model: SupportedModel;
  system?: string;
  messages: Anthropic.MessageParam[];
  maxTokens?: number;
  temperature?: number;
  /** Estimated upper bound, used for preflight budget check. */
  estimatedUsd?: number;
  /** Identifier for cost rollup (e.g. 'extract', 'enrich:translate'). */
  purpose?: string;
}

export interface AnthropicCallResult<T = unknown> {
  text: string;
  usage: { input: number; output: number };
  costUsd: number;
  raw: Anthropic.Message;
  parsed?: T;
}

export async function callAnthropic<T = unknown>(
  opts: AnthropicCallOpts,
  parseJson: ((text: string) => T) | null = null,
): Promise<AnthropicCallResult<T>> {
  const tracker = getBudgetTracker();
  if (opts.estimatedUsd) await tracker.preflight(opts.estimatedUsd);

  const t0 = Date.now();
  const message = await client.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 1024,
    temperature: opts.temperature ?? 0,
    system: opts.system,
    messages: opts.messages,
  });

  const textBlocks = message.content.filter((c): c is Anthropic.TextBlock => c.type === 'text');
  const text = textBlocks.map(b => b.text).join('\n');

  const pricing = ModelPricing[opts.model];
  const costUsd =
    (message.usage.input_tokens / 1_000_000) * pricing.input +
    (message.usage.output_tokens / 1_000_000) * pricing.output;
  tracker.charge(costUsd);

  logger.debug({
    purpose: opts.purpose,
    model: opts.model,
    input: message.usage.input_tokens,
    output: message.usage.output_tokens,
    costUsd: Number(costUsd.toFixed(6)),
    durationMs: Date.now() - t0,
  }, 'anthropic.call');

  const result: AnthropicCallResult<T> = {
    text,
    usage: { input: message.usage.input_tokens, output: message.usage.output_tokens },
    costUsd,
    raw: message,
  };
  if (parseJson) {
    try {
      result.parsed = parseJson(text);
    } catch (e) {
      logger.warn({ err: (e as Error).message, snippet: text.slice(0, 200) }, 'anthropic.parse_failed');
    }
  }
  return result;
}

export function tryParseJson<T>(s: string): T {
  // Tolerate code fences, surrounding chatter; pull first {...} or [...] block.
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body: string = fence?.[1] ?? s;
  const objStart = body.search(/[\{\[]/);
  if (objStart === -1) return JSON.parse(body) as T;
  return JSON.parse(body.slice(objStart)) as T;
}

/** Roll today's call cost into ai_costs_daily (idempotent upsert). */
export async function recordAiCost(
  modelName: SupportedModel,
  usage: { input: number; output: number },
  costUsd: number,
) {
  const isHaiku = modelName.includes('haiku');
  const isSonnet = modelName.includes('sonnet');
  await pgQuery(`
    insert into ai_costs_daily (day, cost_usd, haiku_input_tokens, haiku_output_tokens, sonnet_input_tokens, sonnet_output_tokens, call_count)
    values (current_date, $1, $2, $3, $4, $5, 1)
    on conflict (day) do update set
      cost_usd = ai_costs_daily.cost_usd + excluded.cost_usd,
      haiku_input_tokens = ai_costs_daily.haiku_input_tokens + excluded.haiku_input_tokens,
      haiku_output_tokens = ai_costs_daily.haiku_output_tokens + excluded.haiku_output_tokens,
      sonnet_input_tokens = ai_costs_daily.sonnet_input_tokens + excluded.sonnet_input_tokens,
      sonnet_output_tokens = ai_costs_daily.sonnet_output_tokens + excluded.sonnet_output_tokens,
      call_count = ai_costs_daily.call_count + 1
  `, [
    costUsd,
    isHaiku ? usage.input : 0,
    isHaiku ? usage.output : 0,
    isSonnet ? usage.input : 0,
    isSonnet ? usage.output : 0,
  ]);
}
