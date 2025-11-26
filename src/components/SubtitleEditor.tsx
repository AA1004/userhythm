import React, { useState, useCallback } from 'react';
import { Note } from '../types/game';

interface SubtitleEditorProps {
  chartId: string;
  chartData: {
    notes: Note[];
    bpm: number;
    youtubeVideoId?: string | null;
    youtubeUrl?: string;
    title?: string;
  };
  onClose: () => void;
}

export const SubtitleEditor: React.FC<SubtitleEditorProps> = ({
  chartId,
  chartData,
  onClose,
}) => {
  const [subtitles, setSubtitles] = useState<Array<{
    id: string;
    startTimeMs: number;
    endTimeMs: number;
    text: string;
  }>>([]);

  const handleAddSubtitle = useCallback(() => {
    setSubtitles(prev => [...prev, {
      id: 'sub-' + Date.now(),
      startTimeMs: 0,
      endTimeMs: 2000,
      text: 'New subtitle',
    }]);
  }, []);

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: '#1a1a2e', color: '#fff', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', backgroundColor: '#16213e' }}>
        <h1 style={{ margin: 0 }}>Subtitle Editor</h1>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={handleAddSubtitle} style={{ padding: '10px 20px', backgroundColor: '#4CAF50', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Add</button>
          <button onClick={onClose} style={{ padding: '10px 20px', backgroundColor: '#f44336', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Close</button>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', padding: '20px' }}>
        <div style={{ width: '50%' }}>
          <p>Chart: {chartId} | BPM: {chartData.bpm}</p>
          <p>Notes: {chartData.notes.length}</p>
        </div>
        <div style={{ width: '50%' }}>
          <h2>Subtitles ({subtitles.length})</h2>
          {subtitles.map(sub => (
            <div key={sub.id} style={{ padding: '12px', backgroundColor: '#16213e', borderRadius: '8px', marginBottom: '8px' }}>
              <input type="text" value={sub.text} onChange={e => setSubtitles(prev => prev.map(s => s.id === sub.id ? {...s, text: e.target.value} : s))} style={{ width: '100%', padding: '8px', backgroundColor: '#0f3460', color: '#fff', border: 'none', borderRadius: '4px' }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
