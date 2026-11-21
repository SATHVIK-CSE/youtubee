const form = document.querySelector('#summarize');
const input = document.querySelector('#video-url');
const submitButton = document.querySelector('#summarize-button');
const submitLabel = submitButton.querySelector('.button-label');
const feedback = document.querySelector('#form-feedback');
const results = document.querySelector('#results');
const resultTitle = document.querySelector('#result-title');
const summaryText = document.querySelector('#summary-text');
const watchLink = document.querySelector('#watch-link');
const copyButton = document.querySelector('#copy-button');
const pasteButton = document.querySelector('#paste-button');

pasteButton.addEventListener('click', async () => {
  feedback.textContent = '';
  try {
    input.value = await navigator.clipboard.readText();
    input.focus();
  } catch {
    input.focus();
    feedback.textContent = 'Clipboard access is unavailable here. Paste the link into the box instead.';
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  feedback.textContent = '';
  const url = input.value.trim();
  if (!url) {
    feedback.textContent = 'Paste a YouTube video link first.';
    input.focus();
    return;
  }

  submitButton.disabled = true;
  submitLabel.textContent = 'Finding the good bits…';
  form.setAttribute('aria-busy', 'true');

  try {
    const response = await fetch('/api/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'We could not summarize that video. Please try again.');

    summaryText.textContent = data.summary.replace(/^#{1,3}\s+/gm, '');
    resultTitle.textContent = data.title || 'Your notes are ready.';
    watchLink.href = data.url;
    results.hidden = false;
    results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    feedback.textContent = error.message || 'Something went wrong. Please try again.';
  } finally {
    submitButton.disabled = false;
    submitLabel.textContent = 'Summarize video';
    form.removeAttribute('aria-busy');
  }
});

copyButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(summaryText.textContent);
    copyButton.textContent = 'Copied!';
    setTimeout(() => { copyButton.textContent = 'Copy notes'; }, 1600);
  } catch {
    feedback.textContent = 'Could not copy automatically. Select the notes and copy them manually.';
  }
});
