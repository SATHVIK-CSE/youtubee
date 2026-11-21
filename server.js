import 'dotenv/config';
import express from 'express';
import OpenAI from 'openai';
import { fetchTranscript } from 'youtube-transcript-plus';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const port = Number(process.env.PORT) || 3000;
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

app.use(express.json({ limit: '2kb' }));
app.use(express.static(path.join(currentDir, 'public')));

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

app.post('/api/summarize', async (req, res) => {
  const videoId = extractVideoId(req.body?.url);
  if (!videoId) {
    return res.status(400).json({ error: 'Paste a valid YouTube video link to get started.' });
  }
  if (!openai) {
    return res.status(503).json({ error: 'The AI service is not set up yet. Add your OpenAI API key to the .env file, then restart the server.' });
  }

  try {
    const transcriptResult = await fetchTranscript(videoId, {
      videoDetails: true,
      retries: 1,
      retryDelay: 900
    });
    const segments = transcriptResult.segments ?? transcriptResult;
    if (!Array.isArray(segments) || segments.length === 0) {
      return res.status(422).json({ error: 'No captions were found for this video, so there is nothing to summarize.' });
    }

    const transcript = segments
      .map((segment) => `[${timestamp(segment.start)}] ${String(segment.text ?? '').replace(/\s+/g, ' ').trim()}`)
      .filter((line) => !line.endsWith(']'))
      .join('\n')
      .slice(0, 70000);

    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      instructions: [
        'You turn video transcripts into useful, accurate study notes.',
        'Use only information supported by the transcript. Do not invent facts or fill gaps.',
        'Write in plain text with these sections: QUICK SUMMARY (2–3 sentences), KEY TAKEAWAYS (4–7 concise bullets), and CHAPTERS (3–8 timestamped bullets when timestamps are available).',
        'Keep the whole answer skimmable. If the transcript is incomplete, say so briefly.'
      ].join(' '),
      input: `Summarize this YouTube transcript:\n\n${transcript}`,
      max_output_tokens: 1200
    });

    const summary = response.output_text?.trim();
    if (!summary) throw new Error('The AI returned an empty summary.');

    return res.json({
      summary,
      videoId,
      title: transcriptResult.videoDetails?.title ?? null,
      url: `https://www.youtube.com/watch?v=${videoId}`
    });
  } catch (error) {
    const message = String(error?.message ?? '');
    console.error('Summary request failed:', error?.name ?? 'UnknownError', message.slice(0, 240));

    if (/transcript|caption/i.test(message)) {
      return res.status(422).json({ error: 'YouTube captions are unavailable for this video. Try a public video with captions enabled.' });
    }
    if (error?.status === 401 || error?.status === 403) {
      return res.status(502).json({ error: 'The AI service rejected the configured API key. Check OPENAI_API_KEY in your .env file.' });
    }
    if (error?.status === 429) {
      return res.status(503).json({ error: 'The AI service is busy or your API quota is reached. Try again in a moment.' });
    }
    return res.status(502).json({ error: 'We could not summarize this video right now. It may be unavailable or temporarily blocked; please try again.' });
  }
});

app.listen(port, () => {
  console.log(`Clipnote is ready at http://localhost:${port}`);
});
