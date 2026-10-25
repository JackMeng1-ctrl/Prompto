const PERCENT_SCORE_MIN = 0;
const PERCENT_SCORE_MAX = 100;

function safeParseJsonResponse(text) {
  if (!text || typeof text !== "string") {
    throw new Error("LLM response was empty or not text.");
  }

  let cleaned = text.trim();

  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-zA-Z0-9_-]*\s*/i, "").replace(/```$/, "");
  }

  if (!cleaned.trim().startsWith("{")) {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }
  }

  return JSON.parse(cleaned);
}

function formatHistory(history = []) {
  if (!history.length) {
    return "[]";
  }

  const compact = history.slice(-3).map((entry) => ({
    iteration: entry.iteration,
    candidateId: entry.candidateId,
    score: entry.score,
    summary: entry.summary,
    prompt: entry.prompt
  }));
  return JSON.stringify(compact, null, 2);
}

function sanitizePromptText(text) {
  return typeof text === "string" ? text.trim() : "";
}

export function buildOproCandidatePrompt({
  basePrompt,
  iteration,
  candidateCount,
  history,
  inputColumns = [],
  outputColumn = "",
  outputSamples = []
}) {
  const historySummary = formatHistory(history);
  const inputColumnsList = inputColumns.length ? inputColumns.join(", ") : "None specified";
  const outputColumnLabel = outputColumn || "Not specified";
  const samplesList = outputSamples.length
    ? outputSamples.map((sample, index) => `  ${index + 1}. ${sample}`).join("\n")
    : "  (No samples provided)";

  const systemPrompt = `
You are part of an Optimization by PROmpting (OPRO) loop focused on crafting high-quality, final prompts tailored to a tabular dataset.
Each candidate you produce must be a fully-specified prompt that the user can send directly to an LLM to accomplish the task.
Do not describe the process of designing prompts—output only the final prompt wording.
Return only valid JSON following the specified schema.
`.trim();

  const userPrompt = `
Base user prompt:
${basePrompt}

Available columns:
- Input columns: ${inputColumnsList}
- Output column to target: ${outputColumnLabel}

Output samples to match:
${samplesList}

Iteration: ${iteration}
Previous winning candidates (last few):
${historySummary}

Instructions:
- Generate ${candidateCount} distinct refined prompt candidates.
- Each candidate must be written in the imperative voice as if speaking directly to the downstream LLM, explicitly using the input columns to compute or reason toward the output column.
- Clearly describe how the model should transform the input columns into the desired output column value (include formulas, aggregation steps, or logic).
- Do not mention "design a prompt" or refer to the instructions here; output only the final prompt text.
- Use IDs in the format "it${iteration}_cand_{index}" (start index at 1).
- Return JSON with this shape:
{
  "candidates": [
    {
      "id": "it${iteration}_cand_1",
      "summary": "One sentence describing the refinement strategy",
      "prompt": "The refined prompt text",
      "rationale": "Why this prompt might work well"
    }
  ]
}
`.trim();

  return { systemPrompt, userPrompt };
}

export function buildOproJudgePrompt({
  basePrompt,
  iteration,
  candidates,
  history,
  inputColumns = [],
  outputColumn = "",
  outputSamples = []
}) {
  const historySummary = formatHistory(history);
  const inputColumnsList = inputColumns.length ? inputColumns.join(", ") : "None specified";
  const outputColumnLabel = outputColumn || "Not specified";
  const samplesList = outputSamples.length
    ? outputSamples.map((sample, index) => `  ${index + 1}. ${sample}`).join("\n")
    : "  (No samples provided)";
  const candidateList = JSON.stringify(
    candidates.map((candidate) => ({
      id: candidate.id,
      summary: candidate.summary,
      prompt: candidate.prompt,
      rationale: candidate.rationale
    })),
    null,
    2
  );

  const systemPrompt = `
You are the judge in an Optimization by PROmpting (OPRO) loop.
Score each refined prompt candidate and pick the single best option.
Return only valid JSON following the requested schema.
`.trim();

  const userPrompt = `
Base user prompt:
${basePrompt}

Available columns:
- Input columns: ${inputColumnsList}
- Output column to target: ${outputColumnLabel}

Output samples to match:
${samplesList}

Iteration being scored: ${iteration}
Recent winners:
${historySummary}

Candidates to score:
${candidateList}

Instructions:
- Score each candidate from ${PERCENT_SCORE_MIN} to ${PERCENT_SCORE_MAX} (higher is better).
- Favor prompts that describe concrete steps for using the input columns to produce the output column value accurately.
- Penalize prompts that ignore the input columns or fail to address the output column explicitly.
- Simulate applying each prompt to recreate the provided output samples and consider how well it would generalize to similar rows.
- Provide a short justification for every score.
- Select exactly one bestCandidateId – ties must be broken by your reasoning.
- Return JSON shaped like:
{
  "scores": [
    { "id": "candidate id", "score": 82, "justification": "..." }
  ],
  "bestCandidateId": "candidate id"
}
`.trim();

  return { systemPrompt, userPrompt };
}

export function parseOproCandidates(responseText) {
  let parsed;
  try {
    parsed = safeParseJsonResponse(responseText);
  } catch (error) {
    throw new Error("Candidate generation returned invalid JSON.");
  }

  if (!parsed || !Array.isArray(parsed.candidates)) {
    throw new Error("Candidate generation response is missing the 'candidates' array.");
  }

  const candidates = parsed.candidates
    .map((candidate, index) => {
      const id = typeof candidate.id === "string" && candidate.id.trim()
        ? candidate.id.trim()
        : `cand_${index + 1}`;
      const summary = typeof candidate.summary === "string" ? candidate.summary.trim() : "";
      const rationale = typeof candidate.rationale === "string" ? candidate.rationale.trim() : "";
      const prompt = sanitizePromptText(candidate.prompt);

      if (!prompt) {
        return null;
      }

      return {
        id,
        summary,
        rationale,
        prompt
      };
    })
    .filter(Boolean);

  if (!candidates.length) {
    throw new Error("No valid prompt candidates were returned. Please try again.");
  }

  return candidates;
}

export function parseOproScores(responseText) {
  let parsed;
  try {
    parsed = safeParseJsonResponse(responseText);
  } catch (error) {
    throw new Error("Candidate scoring returned invalid JSON.");
  }

  if (!parsed || !Array.isArray(parsed.scores) || typeof parsed.bestCandidateId !== "string") {
    throw new Error("Candidate scoring response is missing required fields.");
  }

  const scores = parsed.scores
    .map((scoreEntry) => {
      const id = typeof scoreEntry.id === "string" ? scoreEntry.id.trim() : "";
      const score = Number(scoreEntry.score);
      const justification = typeof scoreEntry.justification === "string"
        ? scoreEntry.justification.trim()
        : "";

      if (!id || Number.isNaN(score)) {
        return null;
      }

      const boundedScore = Math.min(
        PERCENT_SCORE_MAX,
        Math.max(PERCENT_SCORE_MIN, score)
      );

      return {
        id,
        score: boundedScore,
        justification
      };
    })
    .filter(Boolean);

  if (!scores.length) {
    throw new Error("Judge response did not include any valid scores.");
  }

  return {
    scores,
    bestCandidateId: parsed.bestCandidateId.trim()
  };
}
