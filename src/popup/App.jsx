import { useEffect, useState } from 'react';
import { HashRouter as Router, Route, Routes } from 'react-router-dom';

import ClarifyingQuestionsPage from './pages/ClarifyingQuestionsPage';
import DatasetConfigPage from './pages/DatasetConfigPage';
import InputPromptPage from './pages/InputPromptPage';
import RefinedPromptPage from './pages/RefinedPromptPage';

import './App.css';

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    chrome.storage.local.get('popupState', (res) => {
      const popupState = res['popupState'];
      if (popupState?.path) {
        window.location.hash = '#' + popupState.path;
      }
      setReady(true);
    });
  }, []);

  if (!ready) return null;

  return (
    <Router>
      <Routes>
        <Route path="/" element={<InputPromptPage />} />
        <Route path="/dataset-config" element={<DatasetConfigPage />} />
        <Route path="/clarifying" element={<ClarifyingQuestionsPage />} />
        <Route path="/refined" element={<RefinedPromptPage />} />
      </Routes>
    </Router>
  );
}
