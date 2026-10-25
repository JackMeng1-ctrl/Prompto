import { createPortal } from 'react-dom';

export default function Loading({ text }) {
  return createPortal(
    <div className="modal-backdrop">
      <div className="spinner" />
      <div className="loading-text">
        {text}
      </div>
    </div>,
    document.body
  );
}
