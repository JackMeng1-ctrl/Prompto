import { useCallback, useEffect, useState } from 'react';

export const datasetInitialState = {
  datasetName: "",
  datasetContent: null,
  datasetSelection: {
    outputColumn: "",
    inputColumns: []
  },
  datasetError: "",
  datasetConfigError: "",
  isDatasetConfigLoading: false
};

export function useDatasetState() {
  const [state, setState] = useState(datasetInitialState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!chrome?.storage?.local?.get) {
      setHydrated(true);
      return;
    }

    chrome.storage.local.get("datasetState", (res) => {
      const storedState = res["datasetState"];
      if (storedState) {
        setState({ ...datasetInitialState, ...storedState });
      }
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!hydrated || !chrome?.storage?.local?.set) return;

    chrome.storage.local.set({
      datasetState: state
    });
  }, [state, hydrated]);

  const resetState = useCallback(() => setState(datasetInitialState), []);

  return [state, setState, resetState, hydrated];
}
