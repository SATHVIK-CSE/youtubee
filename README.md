# Clipnote — YouTube video summarizer

Clipnote accepts a YouTube video link, fetches captions that are available for that video, and asks an AI model to turn them into a quick summary, key takeaways, and timestamped chapters.

## Tools and frameworks

- **Frontend:** HTML, CSS, and browser JavaScript
- **Backend:** Node.js with Express
- **Caption retrieval:** `youtube-transcript-plus`
- **Summarization:** OpenAI API (`gpt-4.1-mini` by default)
- **Configuration:** `dotenv` reads the server's local `.env` file

## Run locally

1. Install Node.js 20 or newer.
2. In this folder, run `npm install`.
3. Copy `.env.example` to `.env` and add an OpenAI API key. Keep `.env` private; the browser never receives the key.
4. Run `npm start` and open `http://localhost:3000`.

Change `OPENAI_MODEL` in `.env` to use another model available to your API account. API usage may incur charges.

## Notes

The video needs captions that the server can access. Private, age-restricted, unavailable, or caption-disabled videos may not work. Caption retrieval relies on an unofficial YouTube interface through the transcript package, so YouTube changes can affect availability. The app does not store submitted links or summaries.
