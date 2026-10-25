import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import App from "../../src/popup/App.jsx";
import * as llm from "../../src/services/Llm.jsx";

vi.mock("../../src/services/Llm.jsx");

beforeEach(() => {
  global.chrome = {
    storage: {
      local: {
        get: vi.fn((keys, callback) => {
          callback({ popupState: { path: "/", state: {} } });
        }),
        set: vi.fn(() => Promise.resolve()),
      },
    },
  };
})

describe("InputPromptPage Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("navigates to the next page when a meaningful prompt is entered", async () => {
    llm.generateClarifyingQuestionsPrompt.mockResolvedValueOnce({
      systemPrompt: "System prompt mock",
      userPrompt: "User prompt mock"
    });


    llm.generateClarifyingQuestions.mockResolvedValueOnce({
      valid: true,
      questions: [
        "What is the setting of the story?",
        "Who is the main character?",
        "What tone should it have?",
        "Should it include dialogue?",
        "How long should the story be?"
      ]
    });

    llm.generateRefinedPromptsPrompt = vi.fn().mockResolvedValueOnce({
      systemPrompt: "You are a helpful assistant.",
      userPrompt: "Write a story about a robot finding friendship."
    });

    llm.generateRefinedPrompts = vi.fn().mockResolvedValueOnce({
      valid: true,
      refined_prompts: ["A short, warm story about a robot who finds friendship."]
    });

    render(
      <App />
    );
    console.log(global.chrome);

    // simulate user typing a meaningful prompt since the llm determines that calling it would b integration testing
    const input = screen.getByPlaceholderText(/ask anything/i);
    fireEvent.change(input, {
      target: { value: "Write a short story about a robot finding friendship" }
    });

    // trigger the generateClarifyingQuestions call
    const button = screen.getByRole("button", { name: /refine/i });
    fireEvent.click(button);


    // Handle the modal that appears for approval
    const acceptButton = await screen.findByRole("button", { name: /accept/i });
    fireEvent.click(acceptButton);

    // Wait for clarifying questions to appear
    await waitFor(() => {
      const question = screen.getByText(/what is the setting of the story/i);
      expect(question).to.exist;
    });


    // assert
    expect(llm.generateClarifyingQuestions).toHaveBeenCalledTimes(1);
    // second argument is the optional attachment (none in this test)
    expect(llm.generateClarifyingQuestions).toHaveBeenCalledWith(
      "Write a short story about a robot finding friendship",
      null
    );

    const answerInputs = screen.getAllByRole("textbox");
    const answers = [
      "A futuristic city where robots coexist with humans",
      "A lonely maintenance robot named R1",
      "Hopeful and lighthearted",
      "Yes, include friendly dialogue between characters",
      "About 3 paragraphs long"
    ];
    answerInputs.forEach((box, i) => {
      fireEvent.change(box, { target: { value: answers[i] } });
    });

    const submitButton = screen.getByRole("button", { name: /submit/i });
    fireEvent.click(submitButton);

    // Handle the modal that appears for approval
    const acceptButton2 = await screen.findByRole("button", { name: /accept/i });
    fireEvent.click(acceptButton2);

    await waitFor(() => {
      const question = screen.getByText(/A short, warm story about a robot who finds friendship/i);
      expect(question).to.exist;
    });

    expect(llm.generateRefinedPromptsPrompt).toHaveBeenCalledTimes(1);
    expect(llm.generateRefinedPrompts).toHaveBeenCalledTimes(1);


  });


  it("shows an error and does not call LLM for meaningless prompts", async () => {
    render(<App />);

    // simulate user typing a meaningless prompt
    const input = screen.getByPlaceholderText(/ask anything/i);
    fireEvent.change(input, {
      target: { value: "asdfasdf" }
    });

    // trigger the refine action
    const button = screen.getByRole("button", { name: /refine/i });
    fireEvent.click(button);

    // assert LLM was NOT called
    expect(llm.generateClarifyingQuestions).not.toHaveBeenCalled();

    // check for the red error message (or whatever text your component shows)
    await waitFor(() => {
      const error = screen.getByText(/please enter a clear, meaningful prompt/i);
      expect(error).to.exist;
    });
  });
})
