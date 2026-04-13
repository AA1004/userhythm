import React from 'react';

interface ChartSelectTransitionProps {
  onCancel: () => void;
}

const transitionNotes = [
  { lane: 0, delay: '0ms', height: 46 },
  { lane: 1, delay: '140ms', height: 72 },
  { lane: 2, delay: '280ms', height: 54 },
  { lane: 3, delay: '420ms', height: 88 },
];

export const ChartSelectTransition: React.FC<ChartSelectTransitionProps> = ({ onCancel }) => {
  return (
    <div className="chart-select-transition" role="status" aria-live="polite">
      <div className="chart-select-transition__grid" aria-hidden="true" />
      <div className="chart-select-transition__stage" aria-hidden="true">
        <div className="chart-select-transition__lanes">
          {[0, 1, 2, 3].map((lane) => (
            <span key={lane} />
          ))}
          {transitionNotes.map((note) => (
            <i
              key={`${note.lane}-${note.delay}`}
              style={{
                left: `${16 + note.lane * 22}%`,
                animationDelay: note.delay,
                height: `${note.height}px`,
              }}
            />
          ))}
        </div>
        <div className="chart-select-transition__judge-line" />
      </div>

      <section className="chart-select-transition__copy">
        <p className="chart-select-transition__eyebrow">CHART SELECT</p>
        <h1>곡 목록 준비 중</h1>
        <p>차트 데이터를 불러오고 있습니다. 곧 선택 화면으로 이동합니다.</p>
        <div className="chart-select-transition__meter" aria-hidden="true">
          <span />
        </div>
        <button type="button" onClick={onCancel}>
          취소
        </button>
      </section>
    </div>
  );
};
