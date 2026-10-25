import OpenAI from 'openai';

/* --------- attachment rules --------- */

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // OpenAI allows 50 MB per request

const MIME_BY_EXTENSION = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
};

export const ALLOWED_ATTACHMENT_EXTENSIONS = new Set(Object.keys(MIME_BY_EXTENSION));

export function getFileExtension(name = '') {
  const dot = String(name).lastIndexOf('.');
  return dot === -1 ? '' : String(name).slice(dot + 1).toLowerCase();
}

/** Returns an error message for the user, or '' if the file can be attached. */
export function validateAttachment(file) {
  if (!file) return '';
  if (!ALLOWED_ATTACHMENT_EXTENSIONS.has(getFileExtension(file.name))) {
    return 'Only PDF, DOC, DOCX, or TXT files are allowed.';
  }
  if (!file.size) return 'That file is empty.';
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return `That file is too large. The limit is ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB.`;
  }
  return '';
}

/* --------- chrome.storage helpers --------- */

function getSyncValue(key) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get([key], (result) => {
      if (chrome.runtime?.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(result?.[key]);
      }
    });
  });
}

async function getApiKey() {
  const key = await getSyncValue('apiKey');
  return typeof key === 'string' ? key.trim() : key;
}

export function getNumRefinedPrompts() {
  return getSyncValue('numRefinedPrompts');
}

export function getNumClarifyingQuestions() {
  return getSyncValue('numClarifyingQuestions');
}

/* --------- file helpers --------- */

function readFile(file, as) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Could not read the attached file.'));
    if (as === 'text') reader.readAsText(file);
    else reader.readAsDataURL(file);
  });
}

// FileReader uses file.type, which Windows often leaves empty for .doc/.docx.
// OpenAI needs the real MIME type, so build the data URI from the extension.
async function fileToDataUri(file) {
  const dataUrl = String(await readFile(file, 'dataUrl'));
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const mime =
    MIME_BY_EXTENSION[getFileExtension(file.name)] || file.type || 'application/octet-stream';
  return `data:${mime};base64,${base64}`;
}

/** Builds the Responses API content array for one user turn. */
export async function buildUserContent(userPrompt, file) {
  const content = [];

  if (file) {
    const problem = validateAttachment(file);
    if (problem) throw new Error(problem);

    if (getFileExtension(file.name) === 'txt') {
      // Plain text is cheaper and more reliable sent inline than as a file.
      const text = await readFile(file, 'text');
      content.push({
        type: 'input_text',
        text: `Attached file "${file.name}":\n${text}`,
      });
    } else {
      content.push({
        type: 'input_file',
        filename: file.name,
        file_data: await fileToDataUri(file),
      });
    }
  }

  content.push({ type: 'input_text', text: userPrompt });
  return content;
}

/* --------- response helpers --------- */

/** Parses model output as JSON, tolerating a ```json fence around it. */
export function parseJsonResponse(text) {
  const cleaned = String(text ?? '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  return JSON.parse(cleaned);
}

/** Turns an API or network error into a message a user can act on. */
export function toUserMessage(error) {
  const status = error?.status;
  if (status === 401) return 'OpenAI rejected the API key. Check it on the options page.';
  if (status === 429) return 'OpenAI rate limit or quota reached. Wait a moment or check your billing.';
  if (status >= 500) return 'OpenAI is having problems right now. Please try again.';
  if (
    error?.name === 'APIConnectionError' ||
    (error instanceof TypeError && /fetch|network/i.test(error.message))
  ) {
    return 'Could not reach OpenAI. Check your internet connection.';
  }
  return error?.message || 'Something went wrong. Please try again.';
}

/* --------- core LLM caller (supports optional attachment) --------- */

export async function queryLLM(systemPrompt, userPrompt, file) {
  const apiKey = await getApiKey();

  if (!apiKey) {
    throw new Error('No OpenAI API key found. Add one on the options page.');
  }

  const client = new OpenAI({
    apiKey,
    dangerouslyAllowBrowser: true,
  });

  const content = await buildUserContent(userPrompt, file);

  const response = await client.responses.create({
    model: 'gpt-4o',
    instructions: systemPrompt,
    input: [
      {
        role: 'user',
        content,
      },
    ],
    temperature: 0,
  });

  // flattened text helper from Responses API
  return response.output_text;
}

/* --------- prompt builders & wrappers --------- */

export async function generateClarifyingQuestionsPrompt(prompt) {
  const numClarifyingQuestions = await getNumClarifyingQuestions();

  if (!numClarifyingQuestions) {
    throw new Error(
      'Number of clarifying questions is not set. Save your settings on the options page.'
    );
  }

  const systemPrompt = `
You are an assistant that validates whether a given input is appropriate for prompt refinement and generates clarifying questions if it is.  
Follow these rules:
1. If the input is empty, nonsensical, harmful, or unrelated to prompt creation, mark it as invalid.  
2. If the input is valid, return a JSON object with:
   - "valid": true  
   - "questions": an array of clarifying questions that would help refine the prompt, with the number specified by the user.  
3. If invalid, return a JSON object with:
   - "valid": false  
   - "questions": [] (an empty list).  
4. Always return only valid JSON — no explanations or additional text outside the JSON.
5. Do NOT wrap the response in Markdown code fences.
`;

  const userPrompt = `
Here is the input prompt:  
"${prompt}"  

Generate no more than ${numClarifyingQuestions} clarifying questions if the input is valid.  
`;

  return {
    systemPrompt,
    userPrompt,
  };
}

/**
 * Optionally accepts a file (PDF/Word/TXT) that is sent along with the text.
 */
export async function generateClarifyingQuestions(prompt, file) {
  const { systemPrompt, userPrompt } =
    await generateClarifyingQuestionsPrompt(prompt);

  const response = await queryLLM(systemPrompt, userPrompt, file);

  try {
    const parsed = parseJsonResponse(response);

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.valid === 'boolean' &&
      Array.isArray(parsed.questions)
    ) {
      return {
        ...parsed,
        questions: parsed.questions
          .map((q) => (typeof q === 'string' ? q : q?.question ?? q?.text ?? ''))
          .filter((q) => String(q).trim() !== ''),
      };
    } else {
      throw new Error('Response does not match expected structure');
    }
  } catch (error) {
    console.error('Invalid structured response:', error, response);
    return {
      valid: false,
      questions: [],
    };
  }
}

export async function generateRefinedPromptsPrompt(prompt, answers) {
  const numRefinedPrompts = await getNumRefinedPrompts();

  if (!numRefinedPrompts) {
    throw new Error(
      'Number of refined prompts is not set. Save your settings on the options page.'
    );
  }

  const systemPrompt = `
You are an assistant that validates whether a given input (consisting of an original prompt and its answered clarifying questions) is appropriate for refinement, and if valid, produces refined prompt variations.

Follow these rules:
1. If the input is empty, nonsensical, harmful, or unrelated to prompt creation, mark it as invalid.
2. If valid, generate the requested number of refined prompts that incorporate both:
   - The original prompt.
   - The answered clarifying questions (as context for refinement).
3. Always return a JSON object with this exact structure:
{
  "valid": true or false,
  "refined_prompts": [ "prompt1", "prompt2", ... ]
}
4. If invalid, return:
{
  "valid": false,
  "refined_prompts": []
}
5. Always return only valid JSON — no explanations or additional text outside the JSON.  
6. Do NOT wrap the response in Markdown code fences.
`;

  const userPrompt = `
Here is the original prompt:
"${prompt}"

Here are the answered clarifying questions:
${answers}

Generate ${numRefinedPrompts} refined prompts using both the original prompt and the answered clarifying questions if the input is valid.
`;

  return {
    systemPrompt,
    userPrompt,
  };
}

/**
 * Optionally accepts the same attachment used for the clarifying questions,
 * so the refined prompts can use the document as context too.
 */
export async function generateRefinedPrompts(prompt, answers, file) {
  const { systemPrompt, userPrompt } =
    await generateRefinedPromptsPrompt(prompt, answers);

  const response = await queryLLM(systemPrompt, userPrompt, file);

  try {
    const parsed = parseJsonResponse(response);

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.valid === 'boolean' &&
      Array.isArray(parsed.refined_prompts)
    ) {
      return parsed;
    } else {
      throw new Error('Response does not match expected structure');
    }
  } catch (error) {
    console.error('Invalid structured response:', error, response);
    return {
      valid: false,
      refined_prompts: [],
    };
  }
}
