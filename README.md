# Prompto

English | [中文](README.zh-CN.md)

Prompto is a Chrome extension (Manifest V3) that turns a rough idea into a well-specified LLM prompt. It asks you a few clarifying questions about what you want, then generates several refined prompt variations you can compare and copy.

> **About this repository.** Prompto was built by a five-person team in Fall 2025. This is my personal copy: it starts from the team's final version, plus fixes I made afterward. See [Team and credits](#team-and-credits).

## Features

- **Clarify, then refine.** Enter a prompt, answer the clarifying questions GPT-4o generates, and get refined prompt variations in tabs, each with a copy button.
- **Document context.** Attach a PDF, Word (DOC/DOCX), or TXT file and it is sent with the prompt as context (up to 20 MB).
- **Dataset mode (OPRO-style).** Upload a CSV or TSV, choose the input and output columns, and Prompto iterates on candidate prompts, scoring each against rows from your data.
- **You approve every call.** Before anything is sent to the model, Prompto shows the exact system and user prompt and waits for Accept.
- **Popup or side panel.** The same flow runs in the toolbar popup and in Chrome's side panel. On sites you list in the options page (such as `chatgpt.com`), an "Open Prompto" button opens the side panel.
- **Survives the popup closing.** The current step and your answers are saved to `chrome.storage.local` and restored when you reopen Prompto.

## Getting started

Requires Node.js 18+ and Chrome 116+.

```bash
npm install
npm run build
```

1. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and select the `dist` folder.
2. Open the extension's **Options** page and add your OpenAI API key. You can also set the number of clarifying questions and refined prompts there, and list the sites where the side panel button should appear.
3. Click the Prompto icon in the toolbar to start.

## Development

```bash
npm run dev       # Vite dev server with hot reload (load dist/ as above)
npm test          # Vitest in watch mode
npx vitest run    # run the tests once
npm run coverage  # coverage report
```

## How it works

```
popup and side panel (React, HashRouter)
  /                 InputPromptPage          prompt, optional document, optional dataset
  /clarifying       ClarifyingQuestionsPage  answer the generated questions
  /dataset-config   DatasetConfigPage        pick columns, run the OPRO loop
  /refined          RefinedPromptPage        compare and copy results

services/Llm.jsx    every OpenAI call (Responses API, gpt-4o, JSON-only output)
background/         service worker: enables / opens the side panel on listed sites
content/autoOpen.js injects the "Open Prompto" button on listed sites
options/            API key, counts, and site list (chrome.storage.sync)
```

## Project structure

```
src/
  background/index.js        side panel service worker
  content/autoOpen.js        in-page "Open Prompto" button
  options/                   settings page
  popup/
    pages/                   one component per step of the flow
    hooks/                   usePopupState, useDatasetState (persisted state)
    utils/                   dataset parsing, OPRO prompt builders, input validation
    components/              Loading, Notification
  sidepanel/                 the same pages, hooks, and utils, rendered in the side panel
  services/Llm.jsx           OpenAI client, attachment handling, response parsing
test/                        Vitest + Testing Library tests
manifest.config.js           extension manifest (CRXJS)
```

## Security and privacy

- Your OpenAI API key is stored in `chrome.storage.sync` and requests go straight from the browser to OpenAI (`dangerouslyAllowBrowser`). That is fine for a personal tool. A public release should route calls through a small backend so the key never sits in the browser.
- Prompto sends nothing until you press Accept on the approval dialog.
- The content script runs on all pages but only adds the button on the sites you list.

## Known limitations

- An attached document is kept in memory only, so it has to be re-attached if Prompto closes before you finish.
- Model output is parsed as JSON. If the model returns something else, Prompto shows an error and you can retry.
- The side panel has its own copies of the popup's pages, hooks, and utils, so a change to one has to be made in both.

## Team and credits

Built by a five-person team in Fall 2025.

**My contributions to the team version (QingXin "Jack" Meng):**

- Document upload for PDF, DOC/DOCX, and TXT files, sent to the OpenAI Responses API as context, with a remove control
- "Open Prompto" button that opens the side panel on user-configured sites (content script + background service worker)
- Client-side validation for prompt input and the options page
- Side panel UI fixes and the extension icon

**Changes in this copy, made afterward:**

- Attached files are no longer written to `chrome.storage` (a `File` object turned into `{}`, so reopening Prompto and submitting failed silently)
- Readable errors for a bad API key, rate limits, and network failures instead of silent failures
- File size limit, correct MIME types for Word files, and TXT files sent inline as text
- The attachment is also used when generating the refined prompts
- The side panel now opens reliably (`sidePanel.open()` is called during the click, not after an async storage read)
- Options page: API key is trimmed and masked, slider labels match their values, inline error for an invalid site
- Test suite updated and extended: from 7 of 10 tests passing to 29 of 29
