import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { getNumRefinedPrompts, queryLLM } from '@/services/Llm';

import Loading from '../components/Loading';
import Notification from '../components/Notification';
import { useDatasetState } from '../hooks/useDatasetState';
import {
  buildSelectedDatasetPayload,
  hasDatasetContent,
  sampleColumnValues
} from '../utils/dataset';
import {
  buildOproCandidatePrompt,
  buildOproJudgePrompt,
  parseOproCandidates,
  parseOproScores
} from '../utils/opro';
import { isMeaningful } from '../utils/validation';

const OPRO_SETTINGS = {
  iterations: 2,
  candidatesPerIteration: 3
};

export default function DatasetConfigPage() {
  const navigate = useNavigate();
  const [datasetState, setDatasetState, , hydrated] = useDatasetState();
  const [prompt, setPrompt] = useState("");
  const [promptHydrated, setPromptHydrated] = useState(false);
  const [pendingApproval, setPendingApproval] = useState(null);
  const [topCandidateCount, setTopCandidateCount] = useState(3);
  const allScoredCandidatesRef = useRef([]);
  const mergeCandidateEntries = (existingEntries, newEntries) => {
    const map = new Map();
    (existingEntries || []).forEach((entry) => {
      if (entry?.candidateId) {
        map.set(entry.candidateId, entry);
      }
    });
    (newEntries || []).forEach((entry) => {
      if (entry?.candidateId && entry.prompt) {
        const previous = map.get(entry.candidateId);
        if (!previous) {
          map.set(entry.candidateId, entry);
        } else {
          const previousScore = typeof previous.score === "number" ? previous.score : -Infinity;
          const nextScore = typeof entry.score === "number" ? entry.score : -Infinity;
          if (nextScore >= previousScore) {
            map.set(entry.candidateId, entry);
          }
        }
      }
    });
    return Array.from(map.values());
  };

  const datasetContent = datasetState.datasetContent;
  const datasetSelection = datasetState.datasetSelection || { outputColumn: "", inputColumns: [] };
  const datasetAvailable = hasDatasetContent(datasetContent);
  const datasetHeaders = Object.keys(datasetContent || {});
  const availableInputHeaders = useMemo(
    () => datasetHeaders.filter((header) => header !== datasetSelection.outputColumn),
    [datasetHeaders, datasetSelection.outputColumn]
  );

  useEffect(() => {
    if (!chrome?.storage?.local?.get) {
      setPromptHydrated(true);
      return;
    }
    chrome.storage.local.get("popupState", (res) => {
      const storedPrompt = res?.popupState?.state?.prompt || "";
      setPrompt(storedPrompt);
      setPromptHydrated(true);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    getNumRefinedPrompts()
      .then((value) => {
        if (cancelled) return;
        const parsed = Number(value);
        if (!Number.isNaN(parsed) && parsed > 0) {
          setTopCandidateCount(parsed);
        }
      })
      .catch(() => {
        // Default already set
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!datasetAvailable) {
      navigate("/");
    }
  }, [datasetAvailable, hydrated, navigate]);

  function handleOutputColumnChange(value) {
    setDatasetState((prev) => ({
      ...prev,
      datasetSelection: {
        outputColumn: value,
        inputColumns: (prev.datasetSelection?.inputColumns || []).filter((header) => header !== value)
      }
    }));
  }

  function toggleInputColumn(header) {
    setDatasetState((prev) => {
      const existing = prev.datasetSelection?.inputColumns || [];
      const nextInputs = existing.includes(header)
        ? existing.filter((item) => item !== header)
        : [...existing, header];
      return {
        ...prev,
        datasetSelection: {
          ...(prev.datasetSelection || { outputColumn: "", inputColumns: [] }),
          inputColumns: nextInputs
        }
      };
    });
  }

  function buildCandidateApproval(datasetPayload, history, iteration, columnConfig) {
    const { inputColumns = [], outputColumn = "", outputSamples = [] } = columnConfig || {};
    const { systemPrompt, userPrompt } = buildOproCandidatePrompt({
      basePrompt: prompt,
      iteration,
      candidateCount: OPRO_SETTINGS.candidatesPerIteration,
      history,
      inputColumns,
      outputColumn,
      outputSamples
    });

    return {
      type: "candidates",
      iteration,
      systemPrompt,
      userPrompt,
      metadata: {
        datasetPayload,
        history,
        iteration,
        columnConfig: { inputColumns, outputColumn, outputSamples }
      }
    };
  }

  function buildJudgeApproval(datasetPayload, history, iteration, candidates, columnConfig) {
    const { inputColumns = [], outputColumn = "", outputSamples = [] } = columnConfig || {};
    const { systemPrompt, userPrompt } = buildOproJudgePrompt({
      basePrompt: prompt,
      iteration,
      candidates,
      history,
      inputColumns,
      outputColumn,
      outputSamples
    });

    return {
      type: "judge",
      iteration,
      systemPrompt,
      userPrompt,
      metadata: {
        datasetPayload,
        history,
        iteration,
        candidates,
        columnConfig: { inputColumns, outputColumn, outputSamples }
      }
    };
  }

  function beginOproFlow(datasetPayload, columnConfig) {
    const nextIteration = 1;
    const history = [];
    setPendingApproval(buildCandidateApproval(datasetPayload, history, nextIteration, columnConfig));
  }

  async function handleDatasetStart() {
    if (!datasetSelection.outputColumn) {
      setDatasetState((prev) => ({ ...prev, datasetConfigError: "Select an output column before continuing." }));
      return;
    }
    if ((datasetSelection.inputColumns || []).length === 0) {
      setDatasetState((prev) => ({ ...prev, datasetConfigError: "Select at least one input column before continuing." }));
      return;
    }
    if (!isMeaningful(prompt)) {
      setDatasetState((prev) => ({ ...prev, datasetConfigError: "Please enter a clear, meaningful prompt before starting." }));
      navigate("/");
      return;
    }

    const datasetPayload = buildSelectedDatasetPayload(
      datasetContent,
      datasetState.datasetName,
      datasetSelection.outputColumn,
      datasetSelection.inputColumns
    );

    if (!datasetPayload) {
    setDatasetState((prev) => ({ ...prev, datasetConfigError: "Unable to build the dataset payload. Please re-upload the dataset." }));
    return;
  }

    allScoredCandidatesRef.current = [];
    const columnConfig = {
      inputColumns: datasetSelection.inputColumns || [],
      outputColumn: datasetSelection.outputColumn || "",
      outputSamples: sampleColumnValues(datasetContent, datasetSelection.outputColumn, 5)
    };

    setDatasetState((prev) => ({ ...prev, datasetConfigError: "", isDatasetConfigLoading: false }));
    beginOproFlow(datasetPayload, columnConfig);
  }

  function handleBack() {
    navigate("/");
  }

  if (!hydrated || !promptHydrated) {
    return <Loading />;
  }

  if (!datasetAvailable) {
    return null;
  }

  async function handleApprovalAccept() {
    if (!pendingApproval) return;
    const currentApproval = pendingApproval;
    setPendingApproval(null);
    setDatasetState((prev) => ({ ...prev, datasetConfigError: "", isDatasetConfigLoading: true }));

    try {
      const response = await queryLLM(currentApproval.systemPrompt, currentApproval.userPrompt);

      if (currentApproval.type === "candidates") {
        const candidates = parseOproCandidates(response);
        setPendingApproval(
          buildJudgeApproval(
            currentApproval.metadata.datasetPayload,
            currentApproval.metadata.history,
            currentApproval.metadata.iteration,
            candidates,
            currentApproval.metadata.columnConfig
          )
        );
        return;
      }

      const { scores, bestCandidateId } = parseOproScores(response);
      const candidates = currentApproval.metadata.candidates || [];
      if (!candidates.length) {
        throw new Error("No candidates available to score. Please restart the dataset flow.");
      }

      const bestCandidate =
        candidates.find((candidate) => candidate.id === bestCandidateId) ||
        (() => {
          const sorted = [...scores].sort((a, b) => (b.score || 0) - (a.score || 0));
          const fallbackId = sorted[0]?.id;
          return candidates.find((candidate) => candidate.id === fallbackId);
        })();

      if (!bestCandidate) {
        throw new Error("The judge could not determine a winning candidate. Please try again.");
      }

      const scoredCandidates = scores
        .map((scoreEntry) => {
          const candidate = candidates.find((item) => item.id === scoreEntry.id);
          if (!candidate || !candidate.prompt) {
            return null;
          }
          return {
            candidateId: candidate.id,
            summary: candidate.summary,
            prompt: candidate.prompt.trim(),
            score: scoreEntry.score
          };
        })
        .filter(Boolean);

      const mergedCandidates = mergeCandidateEntries(allScoredCandidatesRef.current, scoredCandidates);
      allScoredCandidatesRef.current = mergedCandidates;

      const bestScore = scores.find((item) => item.id === bestCandidate.id)?.score ?? null;
      const updatedHistory = [
        ...currentApproval.metadata.history,
        {
          iteration: currentApproval.metadata.iteration,
          candidateId: bestCandidate.id,
          summary: bestCandidate.summary,
          score: bestScore,
          prompt: bestCandidate.prompt
        }
      ];

      const nextIteration = currentApproval.metadata.iteration + 1;
      if (nextIteration <= OPRO_SETTINGS.iterations) {
        setPendingApproval(
          buildCandidateApproval(
            currentApproval.metadata.datasetPayload,
            updatedHistory,
            nextIteration,
            currentApproval.metadata.columnConfig
          )
        );
      } else {
        const sortedCandidates = mergedCandidates
          .filter((entry) => typeof entry.prompt === "string" && entry.prompt.trim().length > 0)
          .sort((a, b) => {
            const aScore = typeof a.score === "number" ? a.score : -Infinity;
            const bScore = typeof b.score === "number" ? b.score : -Infinity;
            return bScore - aScore;
          });

        const displayCount = Math.min(topCandidateCount, sortedCandidates.length);

        if (displayCount === 0) {
          throw new Error("Optimization finished but produced no valid refined prompts.");
        }

        const refinedPrompts = sortedCandidates
          .slice(0, displayCount)
          .map((entry) => entry.prompt.trim())
          .filter(Boolean);

        if (refinedPrompts.length === 0) {
          throw new Error("Optimization finished but produced no valid refined prompts.");
        }

        navigate("/refined", { state: { refined_prompts: refinedPrompts } });
      }
    } catch (error) {
      console.error(error);
      setDatasetState((prev) => ({
        ...prev,
        datasetConfigError: error?.message || "The LLM request failed. Please try again."
      }));
    } finally {
      setDatasetState((prev) => ({ ...prev, isDatasetConfigLoading: false }));
    }
  }

  function handleApprovalReject() {
    setPendingApproval(null);
    setDatasetState((prev) => ({
      ...prev,
      datasetConfigError: "LLM request canceled. Adjust the configuration to try again."
    }));
  }

  return (
    <>
      <header className="page-header">
        <button onClick={handleBack}>← Back</button>
        <h3>Configure Dataset</h3>
      </header>
      <div className="dataset-config-body">
        <div className="dataset-name-row">
          <strong>Dataset:</strong> {datasetState.datasetName}
        </div>
        <div className="dataset-config-field">
          <label htmlFor="output-column">Output Column</label>
          <select
            id="output-column"
            value={datasetSelection.outputColumn}
            onChange={(event) => handleOutputColumnChange(event.target.value)}
          >
            {datasetHeaders.map((header) => (
              <option key={header} value={header}>{header}</option>
            ))}
          </select>
        </div>

        <div className="dataset-config-field">
          <div className="input-columns-title">Input Columns</div>
          {availableInputHeaders.length === 0 ? (
            <div className="no-columns-placeholder">
              No additional columns available. Adjust the output column to see more options.
            </div>
          ) : (
            <div className="input-columns-table-wrapper">
              <table className="input-columns-table">
                <thead>
                  <tr>
                    {availableInputHeaders.map((header) => {
                      const isChecked = (datasetSelection.inputColumns || []).includes(header);
                      return (
                        <th key={header} className={isChecked ? "selected" : ""}>
                          <label className="input-column-header">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleInputColumn(header)}
                            />
                            <span>{header}</span>
                          </label>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 10 }).map((_, rowIndex) => (
                    <tr key={rowIndex}>
                      {availableInputHeaders.map((header) => {
                        const values = datasetContent?.[header] || [];
                        const rawValue = values[rowIndex] ?? "";
                        let displayValue = typeof rawValue === "string" ? rawValue.trim() : String(rawValue ?? "");
                        if (typeof displayValue === "string" && displayValue.includes("\n")) {
                          const firstLine = displayValue.split(/\r?\n/)[0];
                          displayValue = `${firstLine}...`;
                        }
                        return (
                          <td key={header}>
                            {displayValue || <span className="placeholder">(empty)</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {datasetState.datasetConfigError && <div className="error-text dataset-error-text">{datasetState.datasetConfigError}</div>}

        <button
          type="button"
          className="dataset-start-button"
          onClick={handleDatasetStart}
          disabled={datasetState.isDatasetConfigLoading || !datasetSelection.outputColumn || Boolean(pendingApproval)}
        >
          {datasetState.isDatasetConfigLoading ? "Starting..." : "Start"}
        </button>
      </div>

      {pendingApproval && (
        <Notification>
          <h2>Approve LLM Usage</h2>
          <p>{pendingApproval.type === "candidates" ? "Generate refined prompt candidates" : "Score refined prompt candidates"} (Iteration {pendingApproval.iteration})</p>
          <div className="modal-query-box">
            <h4>System Prompt</h4>
            {pendingApproval.systemPrompt}
            <h4>User Prompt</h4>
            {pendingApproval.userPrompt}
          </div>
          <div className="modal-buttons">
            <button onClick={handleApprovalAccept} disabled={datasetState.isDatasetConfigLoading}>
              Accept
            </button>
            <button onClick={handleApprovalReject} disabled={datasetState.isDatasetConfigLoading}>
              Reject
            </button>
          </div>
        </Notification>
      )}

      {datasetState.isDatasetConfigLoading && <Loading />}
    </>
  );
}
