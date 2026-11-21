import 'dotenv/config';
import express from 'express';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { fetchTranscript } from 'youtube-transcript-plus';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const port = Number(process.env.PORT) || 3000;
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;
const gemini = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      // Gemini's YouTube video input is currently available through v1beta.
      httpOptions: { apiVersion: 'v1beta' }
    })
  : null;

app.use(express.json({ limit: '2kb' }));
app.use(express.static(path.join(currentDir, 'public')));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

function extractVideoId(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const supportedHosts = new Set([
    'youtube.com', 'm.youtube.com', 'music.youtube.com',
    'youtu.be', 'youtube-nocookie.com'
  ]);
  if (!supportedHosts.has(host)) return null;

  let candidate = '';
  if (host === 'youtu.be') {
    candidate = url.pathname.split('/').filter(Boolean)[0] ?? '';
  } else if (url.pathname === '/watch') {
    candidate = url.searchParams.get('v') ?? '';
  } else {
    candidate = url.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/)?.[1] ?? '';
  }
  return /^[A-Za-z0-9_-]{11}$/.test(candidate) ? candidate : null;
}

function timestamp(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${minutes}:${String(secs).padStart(2, '0')}`;
}

function formatTranscript(segments) {
  if (!Array.isArray(segments)) return '';
  return segments
    .map((segment) => `[${timestamp(segment.start)}] ${String(segment.text ?? '').replace(/\s+/g, ' ').trim()}`)
    .filter((line) => !line.endsWith(']'))
    .join('\n')
    .slice(0, 70000);
}

async function fetchTranscriptQuickly(videoId) {
  let timeoutId;
  try {
    return await Promise.race([
      fetchTranscript(videoId, { retries: 0, retryDelay: 0 }),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Caption lookup timed out')), 6000);
      })
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function selectedAIProvider() {
  const preference = (process.env.AI_PROVIDER || 'auto').trim().toLowerCase();
  if (preference === 'auto') return gemini ? 'gemini' : openai ? 'openai' : null;
  return preference;
}

const summaryInstructions = [
  'You turn the supplied video or transcript into useful, accurate study notes.',
  'Use only information supported by the supplied source. Do not invent facts or fill gaps.',
  'Write in plain text with these sections: QUICK SUMMARY (2–3 sentences), KEY TAKEAWAYS (4–7 concise bullets), and CHAPTERS (3–8 timestamped bullets when timestamps are available).',
  'Keep the whole answer skimmable. If the source is incomplete, say so briefly.'
].join(' ');

async function generateSummary(provider, transcript, videoUrl) {
  if (provider === 'gemini') {
    const response = await gemini.interactions.create({
      model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
      system_instruction: summaryInstructions,
      input: transcript
        ? [{ type: 'text', text: `Summarize this YouTube transcript into study notes with timestamps when available.\n\n${transcript}` }]
        : [
            { type: 'text', text: 'Summarize this YouTube video into study notes with timestamps when available.' },
            {
              type: 'video',
              uri: videoUrl,
              processing: { type: 'static', content_layers: ['transcript'] }
            }
          ],
      generation_config: { max_output_tokens: 800, thinking_level: 'minimal' },
      store: false
    });
    return response.output_text?.trim();
  }

  const response = await openai.responses.create({
    model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    instructions: summaryInstructions,
    input: `Summarize this YouTube transcript:\n\n${transcript}`,
    max_output_tokens: 1200
  });
  return response.output_text?.trim();
}

app.post('/api/summarize', async (req, res) => {
  const videoId = extractVideoId(req.body?.url);
  if (!videoId) {
    return res.status(400).json({ error: 'Paste a valid YouTube video link to get started.' });
  }
  const provider = selectedAIProvider();
  if (!provider) {
    return res.status(503).json({ error: 'The AI service is not set up yet. Add GEMINI_API_KEY or OPENAI_API_KEY in the server environment, then redeploy.' });
  }
  if (provider === 'gemini' && !gemini) {
    return res.status(503).json({ error: 'AI_PROVIDER is set to gemini, but GEMINI_API_KEY is missing from the server environment.' });
  }
  if (provider === 'openai' && !openai) {
    return res.status(503).json({ error: 'AI_PROVIDER is set to openai, but OPENAI_API_KEY is missing from the server environment.' });
  }
  if (!['gemini', 'openai'].includes(provider)) {
    return res.status(500).json({ error: 'AI_PROVIDER must be set to auto, gemini, or openai.' });
  }

  try {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    let transcriptResult = null;
    let summary;

    if (provider === 'gemini') {
      let transcript = '';
      try {
        const result = await fetchTranscriptQuickly(videoId);
        const segments = result.segments ?? result;
        transcript = formatTranscript(segments);
        if (transcript) console.info('Using fetched captions for Gemini summary.');
      } catch (error) {
        console.warn('Caption lookup did not finish; falling back to Gemini video input:', error?.name ?? 'TranscriptError');
      }
      summary = await generateSummary(provider, transcript || null, videoUrl);
    } else {
      transcriptResult = await fetchTranscript(videoId, {
        videoDetails: true,
        retries: 1,
        retryDelay: 900
      });
      const segments = transcriptResult.segments ?? transcriptResult;
      if (!Array.isArray(segments) || segments.length === 0) {
        return res.status(422).json({ error: 'No captions were found for this video, so there is nothing to summarize.' });
      }

      const transcript = formatTranscript(segments);

      summary = await generateSummary(provider, transcript, videoUrl);
    }
    if (!summary) throw new Error('The AI returned an empty summary.');

    return res.json({
      summary,
      videoId,
      title: transcriptResult?.videoDetails?.title ?? null,
      url: videoUrl
    });
  } catch (error) {
    const message = String(error?.message ?? '');
    console.error('Summary request failed:', error?.name ?? 'UnknownError', message.slice(0, 240));

    if (/transcript|caption/i.test(message)) {
      return res.status(422).json({ error: 'YouTube captions are unavailable for this video. Try a public video with captions enabled.' });
    }
    if (provider === 'gemini' && /youtube|video/i.test(message) && /unavailable|not available|private|not found|public/i.test(message)) {
      return res.status(422).json({ error: 'Gemini could not access this video. Gemini summarization requires a public YouTube video.' });
    }
    if (error?.status === 401 || error?.status === 403 || /API_KEY_INVALID|API key not valid|invalid api key/i.test(message)) {
      const keyName = provider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY';
      return res.status(502).json({ error: `The ${provider === 'gemini' ? 'Gemini' : 'OpenAI'} service rejected its API key. Check ${keyName} in the server environment.` });
    }
    if (error?.status === 429) {
      return res.status(503).json({ error: 'The AI service is busy or your API quota is reached. Try again in a moment.' });
    }
    return res.status(502).json({ error: 'We could not summarize this video right now. It may be unavailable or temporarily blocked; please try again.' });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Clipnote is ready at http://localhost:${port}`);
});
