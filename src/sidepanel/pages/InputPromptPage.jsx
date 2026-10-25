import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  generateClarifyingQuestionsPrompt,
  generateClarifyingQuestions,
  toUserMessage,
  validateAttachment,
} from '@/services/Llm';

import Loading from '../components/Loading';
import Notification from '../components/Notification';

import { useDatasetState } from '../hooks/useDatasetState';
import { usePopupState } from '../hooks/usePopupState';

import {
  buildDatasetPayload,
  deriveDefaultSelection,
  hasDatasetContent,
  parseDatasetContent,
} from '../utils/dataset';

import { isMeaningful } from '../utils/validation';

const allowedExtensions = new Set(['csv', 'tsv']);

const initialState = {
  isNotificationOpen: false,
  isLoading: false,
  userPrompt: '',
  systemPrompt: '',
  prompt: '',
  error: '',
  isTutorialOpen: false,
};

export default function InputPromptPage() {
  const navigate = useNavigate();
  const [state, setState] = usePopupState('/', initialState);

  // The attached document lives only in memory. A File object cannot be saved
  // to chrome.storage (it turns into {}), so it is kept out of the persisted
  // popup state; if the popup closes, the user simply re-attaches it.
  const [attachment, setAttachment] = useState(null);

  const [datasetState, setDatasetState, resetDatasetState] = useDatasetState();

  const datasetInputRef = useRef(null);
  const fileUploadRef = useRef(null);

  const datasetAvailable = hasDatasetContent(datasetState.datasetContent);

  useEffect(() => {
    if (!chrome?.storage?.sync?.get) {
      setState((prev) => ({ ...prev, isTutorialOpen: true }));
      return;
    }

    chrome.storage.sync.get(
      ['apiKey', 'numClarifyingQuestions', 'numRefinedPrompts'],
      (result) => {
        const hasAnyOption =
          Boolean(result?.apiKey) ||
          Boolean(result?.numClarifyingQuestions) ||
          Boolean(result?.numRefinedPrompts);

        setState((prev) => ({ ...prev, isTutorialOpen: !hasAnyOption }));
      }
    );
  }, [setState]);

  useEffect(() => {
    if (
      typeof datasetState.datasetContent === 'string' &&
      datasetState.datasetContent.trim() !== ''
    ) {
      const fallbackDelimiter = datasetState.datasetName?.toLowerCase().endsWith('.tsv')
        ? '\t'
        : ',';

      const parsed = parseDatasetContent(datasetState.datasetContent, fallbackDelimiter);
      const defaults = deriveDefaultSelection(parsed);

      setDatasetState((prev) => ({
        ...prev,
        datasetContent: parsed,
        datasetSelection: defaults,
      }));
    }
  }, [datasetState.datasetContent, datasetState.datasetName, setDatasetState]);

  function clearDataset() {
    resetDatasetState();
    if (datasetInputRef.current) datasetInputRef.current.value = '';
  }

  function clearUploadedFile() {
    setAttachment(null);
    if (fileUploadRef.current) {
      fileUploadRef.current.value = '';
    }
  }

  async function handleFileUpload(event) {
    const file = event.target.files?.[0];

    if (!file) {
      clearUploadedFile();
      return;
    }

    const problem = validateAttachment(file);
    if (problem) {
      clearUploadedFile();
      setState((prev) => ({ ...prev, error: problem }));
      return;
    }

    setAttachment(file);
    setState((prev) => ({ ...prev, error: '' }));
  }

  async function handleDatasetChange(event) {
    const file = event.target.files?.[0];

    if (!file) {
      clearDataset();
      return;
    }

    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    if (!allowedExtensions.has(extension)) {
      clearDataset();
      setDatasetState((prev) => ({
        ...prev,
        datasetError: 'Invalid file type. Please upload a CSV or TSV file.',
      }));
      return;
    }

    try {
      const text = await file.text();
      const delimiter = extension === 'tsv' ? '\t' : ',';
      const parsedDataset = parseDatasetContent(text, delimiter);
      const defaults = deriveDefaultSelection(parsedDataset);

      setDatasetState((prev) => ({
        ...prev,
        datasetName: file.name,
        datasetContent: parsedDataset,
        datasetError: '',
        datasetSelection: defaults,
        datasetConfigError: '',
        isDatasetConfigLoading: false,
      }));
    } catch (err) {
      clearDataset();
      setDatasetState((prev) => ({
        ...prev,
        datasetError: 'Failed to read the dataset.',
      }));
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const newPrompt = state.prompt.trim();

    if (datasetState.datasetError) {
      setState((prev) => ({
        ...prev,
        error: 'Resolve dataset issues before refining.',
      }));
      return;
    }

    if (!isMeaningful(newPrompt)) {
      setState((prev) => ({
        ...prev,
        error:
          "Please enter a clear, meaningful prompt (e.g. 'Write a prompt for my email to request time off').",
      }));
      return;
    }

    setState((prev) => ({ ...prev, error: '', prompt: newPrompt }));

    if (datasetAvailable) {
      setState((prev) => ({ ...prev, systemPrompt: '', userPrompt: '' }));
      navigate('/dataset-config');
      return;
    }

    try {
      const { systemPrompt, userPrompt } =
        await generateClarifyingQuestionsPrompt(newPrompt);

      setState((prev) => ({
        ...prev,
        systemPrompt,
        userPrompt,
        isNotificationOpen: true,
      }));
    } catch (err) {
      setState((prev) => ({ ...prev, error: toUserMessage(err) }));
    }
  }

  async function handleAccept() {
    try {
      setState((prev) => ({ ...prev, isLoading: true }));

      if (!isMeaningful(state.prompt)) {
        setState((prev) => ({
          ...prev,
          error: 'Prompt unclear. Please try again.',
        }));
        return;
      }

      const response = await generateClarifyingQuestions(
        state.prompt,
        attachment
      );

      setState((prev) => ({ ...prev, isNotificationOpen: false }));

      if (response.valid && response.questions.length > 0) {
        navigate('/clarifying', {
          state: {
            questions: response.questions,
            prompt: state.prompt,
            attachment,
          },
        });
      } else {
        setState((prev) => ({
          ...prev,
          error:
            'The assistant could not generate clarifying questions for that prompt. Please rephrase and try again.',
        }));
      }
    } catch (err) {
      // Keep the approval dialog open so the user can read the error and retry.
      setState((prev) => ({ ...prev, error: toUserMessage(err) }));
    } finally {
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  }

  function handleReject() {
    setState((prev) => ({
      ...prev,
      isNotificationOpen: false,
      error: '',
    }));
  }

  function handleOpenOptions() {
    if (chrome?.runtime?.openOptionsPage) {
      chrome.runtime.openOptionsPage();
      return;
    }
    window.open(chrome.runtime.getURL('src/options/index.html'), '_blank');
  }

  return (
    <>
      <header className="page-header">
        <h3>prompto</h3>
      </header>

      <form onSubmit={handleSubmit} className="input-prompt-form">

        {/* TEXTAREA + INSIDE + BUTTON */}
        <div className="textarea-file-wrapper">
          <textarea
            id="prompt"
            name="prompt"
            rows={8}
            placeholder="Ask anything..."
            className={`textarea-with-upload ${state.error ? 'invalid' : ''}`}
            value={state.prompt}
            onChange={(e) =>
              setState((prev) => ({ ...prev, prompt: e.target.value }))
            }
          />

          <button
            type="button"
            className="textarea-upload-button"
            onClick={() => fileUploadRef.current?.click()}
            title="Attach a PDF, Word, or TXT file"
            aria-label="Attach a file"
          >
            <span>+</span>
          </button>

          <input
            ref={fileUploadRef}
            type="file"
            accept=".pdf,.doc,.docx,.txt"
            style={{ display: 'none' }}
            onChange={handleFileUpload}
          />
        </div>

        {/* uploaded PDF/Word file row */}
        {attachment && (
          <div className="file-upload-row">
            <div className="file-upload-button attached-file-pill">
              {attachment.name}
            </div>

            <button
              type="button"
              className="file-remove-button"
              onClick={clearUploadedFile}
            >
              Remove
            </button>
          </div>
        )}

        {state.error && <div className="error-text">{state.error}</div>}

        <input
          type="file"
          id="dataset"
          name="dataset"
          accept=".csv,.tsv"
          onChange={handleDatasetChange}
          ref={datasetInputRef}
          style={{ display: 'none' }}
        />

        <div className="file-upload-row">
          <button
            type="button"
            className="file-upload-button"
            onClick={() => datasetInputRef.current?.click()}
          >
            {datasetState.datasetName || 'Upload dataset (CSV or TSV)'}
          </button>

          {datasetAvailable && (
            <button
              type="button"
              className="file-remove-button"
              onClick={clearDataset}
            >
              Remove
            </button>
          )}
        </div>

        {datasetState.datasetError && (
          <div className="error-text">{datasetState.datasetError}</div>
        )}

        <button type="submit">Refine</button>
      </form>

      {state.isNotificationOpen && (
        <Notification>
          <h2>Approve LLM Usage</h2>
          <p>The following query will be sent to the LLM:</p>

          <div className="modal-query-box">
            <h4>System Prompt</h4>
            {state.systemPrompt}

            <h4>User Prompt</h4>
            {state.userPrompt}
          </div>

          {state.error && <div className="error-text">{state.error}</div>}

          <div className="modal-buttons">
            <button onClick={handleAccept}>Accept</button>
            <button onClick={handleReject}>Reject</button>
          </div>
        </Notification>
      )}

      {state.isLoading && <Loading />}

      {state.isTutorialOpen && (
        <Notification>
          <h2>Welcome to prompto</h2>
          <p>
            Add your API key and settings in the options page before refining prompts.
          </p>
          <div className="modal-buttons">
            <button onClick={handleOpenOptions}>Open Options</button>
          </div>
        </Notification>
      )}
    </>
  );
}
