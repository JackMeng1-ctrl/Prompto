import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

import { generateRefinedPromptsPrompt, generateRefinedPrompts, toUserMessage } from '@/services/Llm';

import Loading from '../components/Loading';
import Notification from '../components/Notification';
import { usePopupState } from '../hooks/usePopupState';

const initialState = {
  isNotificationOpen: false,
  isLoading: false,
  userPrompt: "",
  systemPrompt: "",
  answers: {},
  questions: [],
  prompt: "",
  error: ""
};

export default function ClarifyingQuestionsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  // attachment is the file from the first page (if any). It is passed through
  // router state only, so it is not written to chrome.storage.
  const { questions = [], prompt = "", attachment = null } = location.state || {};

  const [state, setState] = usePopupState("/clarifying", initialState);

  useEffect(() => {
    if (questions.length > 0 || prompt) {
      setState((prev) => ({
        ...prev,
        questions,
        prompt
      }));
    }
  }, [questions, prompt, setState]);

  async function handleSubmit(e) {
    e.preventDefault();
    const formData = new FormData(e.target);

    const newAnswers = {};
    state.questions.forEach((q, i) => {
      newAnswers[q.toString()] = formData.get(`question-${i}`);
    });

    setState((prev) => ({ ...prev, answers: newAnswers, error: "" }));
    try {
      const { systemPrompt: newSystemPrompt, userPrompt: newUserPrompt } = await generateRefinedPromptsPrompt(
        state.prompt,
        JSON.stringify(newAnswers)
      );
      setState((prev) => ({
        ...prev,
        systemPrompt: newSystemPrompt,
        userPrompt: newUserPrompt,
        isNotificationOpen: true
      }));
    } catch (err) {
      setState((prev) => ({ ...prev, error: toUserMessage(err) }));
    }
  }

  async function handleAccept() {
    try {
      setState((prev) => ({ ...prev, isLoading: true }));
      const response = await generateRefinedPrompts(
        state.prompt,
        JSON.stringify(state.answers),
        attachment
      );
      setState((prev) => ({ ...prev, isNotificationOpen: false }));
      if (response.valid && response.refined_prompts.length > 0) {
        navigate("/refined", { state: { refined_prompts: response.refined_prompts } });
      } else {
        setState((prev) => ({
          ...prev,
          error: "The assistant could not refine this prompt. Try adding more detail to your answers."
        }));
      }
    } catch (err) {
      setState((prev) => ({ ...prev, error: toUserMessage(err) }));
    } finally {
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  }

  return (
    <>
      <header className="page-header">
        <button onClick={() => navigate("/")}>← Back</button>
        <h3>Clarifying Questions</h3>
      </header>
      <form onSubmit={handleSubmit} className="clarifying-questions-form">
        {state.questions.map((q, i) => (
          <div key={i}>
            <label>{q}</label>
            <textarea
              id={`question-${i}`}
              name={`question-${i}`}
              rows={2}
              value={state.answers[q] || ""}
              onChange={(event) =>
                setState((prev) => ({
                  ...prev,
                  answers: { ...prev.answers, [q]: event.target.value }
                }))
              }
            />
          </div>
        ))}
        {state.error && <div className="error-text">{state.error}</div>}
        <button type="submit">Submit</button>
      </form>

      {state.isNotificationOpen && (
        <Notification>
          <h2>Approve LLM Usage</h2>
          <div className="modal-query-box">
            <h4>System Prompt</h4>
            {state.systemPrompt}
            <h4>User Prompt</h4>
            {state.userPrompt}
          </div>
          {state.error && <div className="error-text">{state.error}</div>}
          <div className="modal-buttons">
            <button onClick={handleAccept}>Accept</button>
            <button onClick={() => setState((prev) => ({ ...prev, isNotificationOpen: false }))}>
              Reject
            </button>
          </div>
        </Notification>
      )}

      {state.isLoading && <Loading />}
    </>
  );
}
