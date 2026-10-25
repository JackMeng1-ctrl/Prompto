import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

import { usePopupState } from '../hooks/usePopupState';

const initialState = {
  activeTab: 0,
  refined_prompts: []
};

export default function RefinedPromptPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refined_prompts = [] } = location.state || { refined_prompts: [] };

  const [state, setState] = usePopupState("/refined", initialState);

  useEffect(() => {
    if (refined_prompts.length > 0) {
      setState((prev) => ({
        ...prev,
        refined_prompts
      }));
    }
  }, [refined_prompts, setState]);

  return (
    <>
      <header className="page-header">
        <button onClick={() => navigate("/")}>← Back</button>
        <h3>Refined Prompts</h3>
      </header>
      <div className="tabs-header">
        {state.refined_prompts.map((_, index) => (
          <button
            key={index}
            className={`tab ${state.activeTab === index ? "active" : ""}`}
            onClick={() => setState((prev) => ({ ...prev, activeTab: index }))}
          >
            Prompt {index + 1}
          </button>
        ))}
      </div>

      <div className="tab-content">
        <p>{state.refined_prompts[state.activeTab]}</p>
      </div>
    </>
  );
}
