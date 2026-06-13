import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Safely patch ResizeObserver to prevent infinite loops causing browser freezes and lag on mobile viewports/iframes (especially with Recharts)
if (typeof window !== 'undefined') {
  const originalResizeObserver = window.ResizeObserver;
  if (originalResizeObserver) {
    class SafeResizeObserver extends originalResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        let activeFrame: number | null = null;
        const throttledCallback: ResizeObserverCallback = (entries, observer) => {
          if (activeFrame !== null) {
            cancelAnimationFrame(activeFrame);
          }
          activeFrame = requestAnimationFrame(() => {
            activeFrame = null;
            try {
              callback(entries, observer);
            } catch (err) {
              console.warn('ResizeObserver callback warning suppressed:', err);
            }
          });
        };
        super(throttledCallback);
      }
    }
    window.ResizeObserver = SafeResizeObserver;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

