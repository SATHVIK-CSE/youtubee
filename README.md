# Clipnote — YouTube video summarizer

Clipnote accepts a YouTube video link and returns a quick summary, key takeaways, and timestamped chapters. Gemini processes public YouTube videos directly; OpenAI mode uses available captions.

## Tools and frameworks

- **Frontend:** HTML, CSS, and browser JavaScript
- **Backend:** Node.js with Express
- **Caption retrieval:** `youtube-transcript-plus` for the fast Gemini path and OpenAI mode
- **Summarization:** YouTube captions summarized with Google Gemini Flash-Lite (`gemini-3.5-flash-lite` by default), with direct Gemini video input as a fallback; or OpenAI API (`gpt-4.1-mini`)
- **Configuration:** `dotenv` reads the server's local `.env` file

## Run locally

1. Install Node.js 22 or newer.
2. In this folder, run `npm install`.
3. Copy `.env.example` to `.env` and add your `GEMINI_API_KEY` or `OPENAI_API_KEY`. With `AI_PROVIDER=auto`, Gemini is used when its key is present; otherwise OpenAI is used. Set `AI_PROVIDER=gemini` or `AI_PROVIDER=openai` to choose explicitly. Gemini summarizes fetched captions when available and falls back to direct video input if caption retrieval times out or fails. Keep `.env` private; the browser never receives either key.
4. Run `npm start` and open `http://localhost:3000`.

Change `GEMINI_MODEL` or `OPENAI_MODEL` in `.env` to use another model available to your API account. Provider quotas and pricing depend on your account and model.

## Deploy to Render

The included `render.yaml` describes a Node web service. Push the project to GitHub, create a Blueprint in the Render Dashboard, and connect the `SATHVIK-CSE/youtubee` repository. Add `GEMINI_API_KEY` (or `OPENAI_API_KEY`) as a secret in the Render Dashboard and keep it out of GitHub. The deployment uses `npm install` to build and `npm start` to run.

To add a Gemini key, create one in [Google AI Studio](https://aistudio.google.com/api-keys). In Render, open this service's **Environment** page, add `GEMINI_API_KEY`, paste the key as its value, and save with deployment enabled. Leave `AI_PROVIDER` as `auto` to select Gemini whenever its key is configured, or set it to `gemini` to require Gemini. Do not paste API keys into the website or commit them to GitHub.

After the first deploy, Render provides a public `onrender.com` URL. The `/api/health` endpoint is used as the service health check.

## Notes

Gemini mode prefers accessible captions for faster summaries and falls back to Google's public YouTube video input feature. OpenAI mode requires captions that the server can access. Private, age-restricted, unavailable, or caption-disabled videos may not work. Caption retrieval relies on an unofficial YouTube interface through the transcript package, so YouTube changes can affect availability. The app does not store submitted links or summaries.
