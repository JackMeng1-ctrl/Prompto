import { useEffect, useState } from "react";
import ReactDOM from "react-dom";
import "./App.css";

export default function App() {
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [errors, setErrors] = useState({
    apiKey: "",
    numClarifyingQuestions: "",
    numRefinedPrompts: "",
  })
  const [websites, setWebsites] = useState([]);
  const [newWebsite, setNewWebsite] = useState("");
  const [websiteError, setWebsiteError] = useState("");

  function saveOptions(formData) {
    // Trim the key: a pasted key often carries a trailing newline, which
    // OpenAI rejects as an invalid key. Never log the options, they hold the key.
    const options = {
      apiKey: (formData.get("api-key") || "").toString().trim(),
      numClarifyingQuestions: Number(formData.get("num-clarifying-questions")),
      numRefinedPrompts: Number(formData.get("num-refined-prompts")),
      websites: websites || [],
    };
    chrome.storage.sync.set(options, () => {
      // Start the popup flow fresh with the new settings.
      if (chrome?.storage?.local?.remove) {
        chrome.storage.local.remove("popupState");
      }
    });
  }

  function restoreOptions() {
    chrome.storage.sync.get(["apiKey", "numClarifyingQuestions", "numRefinedPrompts", "websites"], (result) => {
      if (result.apiKey) {
        document.getElementById("api-key").value = result.apiKey;
      }
      if (result.numClarifyingQuestions) {
        document.getElementById("num-clarifying-questions").value = result.numClarifyingQuestions;
        const el = document.getElementById('num-clarifying-questions-value');
        if (el) el.textContent = result.numClarifyingQuestions;
      }
      if (result.numRefinedPrompts) {
        document.getElementById("num-refined-prompts").value = result.numRefinedPrompts;
        const el2 = document.getElementById('num-refined-prompts-value');
        if (el2) el2.textContent = result.numRefinedPrompts;
      }
      if (result.websites) {
        setWebsites(result.websites);
      }
    });
  }

  useEffect(() => {
    restoreOptions();
  }, []);

  // Add: helpers to validate inputs
  const isInt = (v) => /^-?\d+$/.test(String(v).trim());
  const inRange = (n, min, max) => n >= min && n <= max;
  function validateInputs(formData) {
    const apiKey = (formData.get("api-key") || "").toString().trim();
    const numClarifyingQuestions = (formData.get("num-clarifying-questions") || "").toString().trim();
    const numRefinedPrompts = (formData.get("num-refined-prompts") || "").toString().trim();
    
    const next = {apiKey: "", numClarifyingQuestions: "", numRefinedPrompts: ""};
    if (!apiKey) next.apiKey = "API Key is required.";
    
  if (!isInt(numClarifyingQuestions)) next.numClarifyingQuestions = "Enter a valid integer.";
  else if (!inRange(parseInt(numClarifyingQuestions, 10), 1, 10)) next.numClarifyingQuestions = "Must be between 1 and 10.";

  if (!isInt(numRefinedPrompts)) next.numRefinedPrompts = "Enter a valid integer.";
  else if (!inRange(parseInt(numRefinedPrompts, 10), 1, 10)) next.numRefinedPrompts = "Must be between 1 and 10.";
    
    setErrors(next);
    return !next.apiKey && !next.numClarifyingQuestions && !next.numRefinedPrompts;
  }
  
  
const handleSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    if (!validateInputs(formData)) return;
    saveOptions(formData);
    setIsNotificationOpen(true);
  };

const handleNotificationClose = () => {
    setIsNotificationOpen(false);
  };

  return (
    <>
      <form id="options-form" onSubmit={handleSubmit} className="options-form">
        <div>
  <label htmlFor="api-key">OpenAI API Key</label>
  <input
    type="password"
    id="api-key"
    name="api-key"
    placeholder="sk-..."
    autoComplete="off"
    spellCheck={false}
    className={errors.apiKey ? "invalid" : ""}
  />
  {errors.apiKey && <div className="error-text">{errors.apiKey}</div>}
</div>

<div>
  <label htmlFor="num-clarifying-questions">Number of Clarifying Questions: <span id="num-clarifying-questions-value">5</span></label>
  <input
    type="range"
    id="num-clarifying-questions"
    name="num-clarifying-questions"
    min="1"
    max="10"
    defaultValue="5"
    className={errors.numClarifyingQuestions ? "invalid" : ""}
    onInput={(e) => {
      const el = document.getElementById('num-clarifying-questions-value');
      if (el) el.textContent = e.target.value;
    }}
  />
  {errors.numClarifyingQuestions && (
    <div className="error-text">{errors.numClarifyingQuestions}</div>
  )}
</div>

<div>
  <label htmlFor="num-refined-prompts">Number of Refined Prompts: <span id="num-refined-prompts-value">5</span></label>
  <input
    type="range"
    id="num-refined-prompts"
    name="num-refined-prompts"
    min="1"
    max="10"
    defaultValue="5"
    className={errors.numRefinedPrompts ? "invalid" : ""}
    onInput={(e) => {
      const el = document.getElementById('num-refined-prompts-value');
      if (el) el.textContent = e.target.value;
    }}
  />
  {errors.numRefinedPrompts && (
    <div className="error-text">{errors.numRefinedPrompts}</div>
  )}
</div>
      </form>

      <div className="websites-section">
        <h4>Websites for Prompto to Open On</h4>
        <div className="website-input-container">
          <input
            type="url"
            id="new-website"
            placeholder="https://chat.openai.com"
            value={newWebsite}
            onChange={(e) => {
              setNewWebsite(e.target.value);
              setWebsiteError("");
            }}
          />
          <button
            type="button"
            onClick={() => {
              if (!newWebsite) return;
              const raw = newWebsite.trim();
              let host = '';
              try {
                if (raw.includes('://') || raw.includes('/')) {
                  host = new URL(raw.includes('://') ? raw : `https://${raw}`).hostname;
                } else {
                  // accept plain hostnames like 'openai.com' or 'chat.openai.com'
                  host = raw.replace(/^\*\./, '').toLowerCase();
                }
                // "www.chatgpt.com" should also match "chatgpt.com"
                host = host.replace(/^www\./, '');

                // basic validation: must contain at least one dot and only valid hostname chars
                if (!/^[a-z0-9.-]+$/i.test(host) || host.indexOf('.') === -1) {
                  throw new Error('invalid');
                }

                if (!websites.includes(host)) {
                  const next = [...websites, host];
                  setWebsites(next);
                  // persist immediately
                  chrome.storage.sync.set({ websites: next });
                }
                setNewWebsite('');
              } catch (e) {
                setWebsiteError('Please enter a valid hostname or URL (e.g. openai.com or https://chat.openai.com)');
              }
            }}
          >Add</button>
        </div>
        {websiteError && <div className="error-text">{websiteError}</div>}

        <ul className="website-list">
          {websites.map((w, i) => (
            <li key={i} className="website-item">
              <span>{w}</span>
              <button type="button" onClick={() => {
                const next = websites.filter((_, idx) => idx !== i);
                setWebsites(next);
                chrome.storage.sync.set({ websites: next });
              }}>Remove</button>
            </li>
          ))}
        </ul>
      </div>

      <button
        type="submit"
        form="options-form"
        className="save-button-bottom"
      >
        Save
      </button>

      {isNotificationOpen && (
        <Notification onClose={handleNotificationClose}>
          <h2>Options Saved</h2>
          <p>The options have been successfully saved.</p>
          <div className="modal-buttons">
            <button onClick={handleNotificationClose}>Close</button>
          </div>
        </Notification>
      )}
    </>
  );
}

/** COMPONENTS */

function Notification({ children, onClose }) {
  return ReactDOM.createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body
  );
}
