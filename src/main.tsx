import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/index.css';

try {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error('Root element not found');
  }

  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
} catch (error) {
  console.error('Failed to initialize app:', error);
  document.body.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #1a1a1a; color: #fff; padding: 20px; text-align: center;">
      <h1 style="color: #f44336; margin-bottom: 20px;">초기화 오류</h1>
      <p>애플리케이션을 초기화하는 중 오류가 발생했습니다.</p>
      <pre style="margin-top: 20px; background: #2a2a2a; padding: 10px; border-radius: 4px; overflow: auto; font-size: 12px;">${error}</pre>
    </div>
  `;
}

