import { createPortal } from 'react-dom';

export default function Notification({ children }) {
  return createPortal(
    <div className="modal-backdrop">
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body
  );
}
