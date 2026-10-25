

import { queryLLM, generateClarifyingQuestions, generateRefinedPrompts, generateRefinedPromptsPrompt, generateClarifyingQuestionsPrompt } from "../../src/services/Llm.jsx";
import OpenAI from "openai";

import { describe, it, expect, vi } from "vitest";

// emulate 
vi.mock("openai", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      responses: {
        create: vi.fn().mockResolvedValue({
          output_text: JSON.stringify({
            valid: true,
            questions: ["Q1?", "Q2?"]
          }) // string
        })
      }
    }))
  };
});





// queryLLM.test.jsx
describe("queryLLM", () => {
  it("returns the mocked response text", async () => {
    const mockResponse = { output_text: "Refined prompt" };

    // mock implementation for OpenAI constructor
    OpenAI.mockImplementation(() => ({
      responses: {
        create: vi.fn().mockResolvedValue(mockResponse),
      },
    }));

    const result = await queryLLM("system prompt", "user prompt");
    expect(result).toBe("Refined prompt");
  });

  it("calls OpenAI with the correct arguments", async () => {
    const mockCreate = vi.fn().mockResolvedValue({ output_text: "ok" });

    OpenAI.mockImplementation(() => ({
      responses: { create: mockCreate },
    }));

    await queryLLM("sys", "usr");

    expect(mockCreate).toHaveBeenCalledWith({
      model: "gpt-4o",
      instructions: "sys",
      input: [
        { role: "user", content: [{ type: "input_text", text: "usr" }] },
      ],
      temperature: 0,
    });
  });
});

   
describe("generateClarifyingQuestionsPrompt", () => {
  it("returns an object", async () => {
    const prompt = "Test prompt";
    const result = await generateClarifyingQuestionsPrompt(prompt);
    expect(result.userPrompt).toContain(prompt);
    expect(result.systemPrompt).toContain("Follow these rules");
  });
});

describe("generateClarifyingQuestions", () => {
    beforeEach(() => { // Mocks kept messing with eachother
    vi.mocked(OpenAI).mockClear();
  });

  it("parses valid JSON returned by queryLLM", async () => {
    // Set up the mock for this specific test
    vi.mocked(OpenAI).mockImplementation(() => ({
      responses: { 
        create: vi.fn().mockResolvedValue({ 
          output_text: JSON.stringify({
            valid: true,
            questions: ["Q1?", "Q2?"]
          })
        }) 
      }
    }));

    const result = await generateClarifyingQuestions("Test prompt");
    expect(result).toEqual({ valid: true, questions: ["Q1?", "Q2?"] });
  });

  it("returns [] when queryLLM returns invalid JSON", async () => {
    // Override mock for this test
    OpenAI.mockImplementation(() => ({
      responses: { create: vi.fn().mockResolvedValue({ output_text: "not-json" }) }
    }));

    const result = await generateClarifyingQuestions("Invalid prompt");
    expect(result).toEqual({ valid: false, questions: [] });

  });
});

describe("generateRefinedPromptsPrompt", () => {
  it("returns an object with systemPrompt and userPrompt containing the original prompt and answers", async () => {
    const prompt = "Find the best coffee shop";
    const answers = ["Near campus", "Open late"];
    const result = await generateRefinedPromptsPrompt(prompt, answers);

    expect(result).toHaveProperty("systemPrompt");
    expect(result).toHaveProperty("userPrompt");

    // Check that the userPrompt contains the original prompt and answers
    expect(result.userPrompt).toContain(prompt);
    answers.forEach(answer => {
    expect(result.userPrompt).toContain(answer);
    });
  });
});

describe("generateRefinedPrompts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the refined prompt when OpenAI responds successfully", async () => {
    // arrange
    OpenAI.mockImplementation(() => ({
      responses: {
        create: vi.fn().mockResolvedValue({
          output_text: JSON.stringify({
            valid: true,
            refined_prompts: ["Refined Prompt 1", "Refined Prompt 2"]
           })
        })
        }
     }));

    const prompt = "Find the best coffee shop";
    const answers = ["Near campus", "Open late"];

    // act
    const result = await generateRefinedPrompts(prompt, answers);

    // assert 
    expect(result).toEqual({
       valid: true,
       refined_prompts: ["Refined Prompt 1", "Refined Prompt 2"]
     });
  });

  it("still returns something (or empty) if OpenAI throws", async () => {
    OpenAI.mockImplementation(() => ({
      responses: {
        create: vi.fn().mockRejectedValue(new Error("API error"))
      }
    }));

    const prompt = "Find the best coffee shop";
    const answers = ["Near campus"];

    let error;
    try {
      await generateRefinedPrompts(prompt, answers);
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(Error);
  });
});