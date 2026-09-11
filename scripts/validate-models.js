/**
 * Validate all registered chat models by sending a test prompt to each.
 * Usage: node scripts/validate-models.js
 */
const { listModels } = require('../src/ai/providers');
const { opencodeLLM } = require('../src/ai/zenClient');

const TEST_PROMPT = 'Say hi in one sentence.';

async function validateModel(model) {
  const start = Date.now();
  try {
    const llm = opencodeLLM(model.id);
    const reply = await llm.chatCompletion({
      messages: [{ role: 'user', content: TEST_PROMPT }],
      maxTokens: 100,
      timeout: 30000,
    });
    const ms = Date.now() - start;
    return { ok: true, reply: reply.slice(0, 80), ms };
  } catch (err) {
    const ms = Date.now() - start;
    return { ok: false, error: err.message?.slice(0, 100), ms };
  }
}

async function main() {
  const models = listModels();
  console.log(`\nValidating ${models.length} chat models...\n`);

  const results = [];
  for (const m of models) {
    process.stdout.write(`  ${m.name.padEnd(35)}`);
    const result = await validateModel(m);
    results.push({ ...m, ...result });
    if (result.ok) {
      console.log(`OK (${result.ms}ms) — "${result.reply}"`);
    } else {
      console.log(`FAIL (${result.ms}ms) — ${result.error}`);
    }
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${passed}/${results.length} passed${failed ? `, ${failed} failed` : ''}\n`);

  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error('Validation script error:', err);
  process.exit(1);
});
