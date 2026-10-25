import { useEffect, useState } from 'react';

export function usePopupState(path, initialState) {
  const [state, setState] = useState(initialState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    chrome.storage.local.get("popupState", (res) => {
      const popupState = res["popupState"];
      if (popupState?.path === path && popupState.state) {
        const hydratedState = { ...initialState, ...popupState.state };
        if ('isLoading' in hydratedState && hydratedState.isLoading) {
          hydratedState.isLoading = false;
        }
        setState(hydratedState);
      }
      setHydrated(true);
    });
  }, [path]);

  useEffect(() => {
    if (!hydrated) return;
    chrome.storage.local.set({
      "popupState": {
        path,
        state
      }
    });
  }, [path, state, hydrated]);

  return [state, setState];
}
