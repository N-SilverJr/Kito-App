/**
 * Local OpenAI-compatible stub for exercising the photo-analysis pipeline without a paid key.
 *
 *   node scripts/ai-stub.mjs           # listens on :8899
 *
 * Then run the API with:
 *   AI_PROVIDER=openai OPENAI_API_KEY=stub \\
 *   OPENAI_BASE_URL=http://localhost:8899/v1 OPENAI_MODEL=stub-vision npm run dev
 *
 * It answers /v1/chat/completions with a plausible two-component Rwandan meal. It is a test
 * double: nothing here is a nutrition model, and it must never be enabled in production.
 */
import { createServer } from 'node:http';

const PORT = Number(process.env.AI_STUB_PORT ?? 8899);

const analysis = {
  dish_name: 'Ubugari with isombe',
  items: [
    {
      name: 'Isombe (cassava leaf stew)',
      local_name: 'Isombe',
      quantity: 1,
      unit: 'bowl',
      grams: 200,
      kcal: 240,
      protein_g: 7,
      carbs_g: 24,
      fat_g: 13,
      fiber_g: 8.4,
      confidence: 0.78,
      portion_uncertainty: 'medium',
      ingredients: ['cassava leaves', 'palm oil', 'onion'],
    },
    {
      name: 'Ubugari (stiff maize meal)',
      local_name: 'Ubugari',
      quantity: 1,
      unit: 'piece',
      grams: 250,
      kcal: 358,
      protein_g: 6,
      carbs_g: 80,
      fat_g: 1,
      fiber_g: 2,
      confidence: 0.71,
      portion_uncertainty: 'high',
      ingredients: ['maize flour', 'water'],
    },
  ],
  observation: 'Two components on one plate; the portion of ubugari is a rough guess.',
  clarifying_question: null,
};

const server = createServer((request, response) => {
  if (request.method !== 'POST' || !request.url?.includes('/chat/completions')) {
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: { message: 'not found' } }));
    return;
  }

  let body = '';
  request.on('data', (chunk) => {
    body += chunk;
  });
  request.on('end', () => {
    // Fail loudly if the app stops sending an image, so a broken pipeline cannot pass silently.
    const hasImage = body.includes('image_url') && body.includes('base64,');
    if (!hasImage) {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { message: 'no image in request' } }));
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        id: 'chatcmpl-stub',
        object: 'chat.completion',
        model: 'stub-vision',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: JSON.stringify(analysis) },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      }),
    );
  });
});

server.listen(PORT, () => {
  console.info(`[ai-stub] listening on http://localhost:${PORT}/v1 (test double, not a model)`);
});
