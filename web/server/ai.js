// Optional AI features (guest Q&A, speech drafts) via the Claude API.
// Without ANTHROPIC_API_KEY everything falls back to non-AI behaviour.
import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';

let client = null;
const getClient = () => (client ??= new Anthropic());

export const aiEnabled = () => config.ai.enabled;

async function ask({ system, prompt, maxTokens = 2000, effort = 'low' }) {
  const response = await getClient().beta.messages.create({
    model: config.ai.model,
    max_tokens: maxTokens,
    // Route policy declines to a suitable fallback model instead of failing.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort },
    system,
    messages: [{ role: 'user', content: prompt }],
  });
  if (response.stop_reason === 'refusal') return null;
  return response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

/**
 * Answers a guest question using only the information the couple provided.
 * Returns { answer, unknown } – unknown=true means the question should go to the couple.
 */
export async function answerGuestQuestion(context, question) {
  const system = `Du bist der freundliche Hochzeits-Assistent von ${context.couple}.
Beantworte Fragen von Hochzeitsgästen kurz (höchstens 3 Sätze), herzlich und auf Deutsch, per Du.
Nutze ausschließlich die Informationen zwischen <infos> und </infos>. Erfinde nichts.
Wenn die Antwort dort nicht steht, antworte exakt mit: UNBEKANNT`;
  const prompt = `<infos>\n${context.text}\n</infos>\n\nFrage des Gastes: ${question}`;
  const text = await ask({ system, prompt, maxTokens: 1000 });
  if (!text || text.includes('UNBEKANNT')) return { answer: null, unknown: true };
  return { answer: text, unknown: false };
}

/** Drafts a wedding speech for a witness from collected anecdotes. */
export async function draftSpeech({ couple, speaker, relation, anecdotes, tone, minutes }) {
  const system = `Du hilfst Trauzeugen, eine persönliche Hochzeitsrede auf Deutsch zu schreiben.
Schreibe natürlich gesprochene Sprache, keine Floskeln-Aneinanderreihung, mit Einstieg, 2–3 Geschichten und einem Toast am Ende.
Verwende nur die gelieferten Anekdoten als Fakten. Markiere Stellen, die der Redner selbst ergänzen sollte, mit [eckigen Klammern].`;
  const prompt = `Brautpaar: ${couple}
Redner: ${speaker} (${relation || 'Trauzeuge/in'})
Ton: ${tone || 'herzlich mit etwas Humor'}
Ziel-Länge: etwa ${minutes || 4} Minuten gesprochen

Gesammelte Anekdoten der Gäste:
${anecdotes.map((a, i) => `${i + 1}. (${a.author_name}) ${a.text}`).join('\n') || '(noch keine)'}`;
  return ask({ system, prompt, maxTokens: 4000, effort: 'medium' });
}
