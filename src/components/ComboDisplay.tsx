import React from 'react';

interface ComboDisplayProps {
  combo: number;
  laneGroupCenterX: number;
  numberOpacity: number;
  visible: boolean;
}

const ComboDisplayComponent: React.FC<ComboDisplayProps> = ({
  combo,
  laneGroupCenterX,
  numberOpacity,
  visible,
}) => {
  if (!visible || combo <= 0) return null;

  return (
    <div
      className="combo-display"
      style={
        {
          left: `${laneGroupCenterX}px`,
          '--combo-number-opacity': numberOpacity,
        } as React.CSSProperties
      }
      aria-label={`Combo ${combo}`}
    >
      <span className="combo-display__number" key={combo}>
        {combo}
      </span>
      <span className="combo-display__label">COMBO</span>
    </div>
  );
};

export const ComboDisplay = React.memo(
  ComboDisplayComponent,
  (prev, next) =>
    prev.combo === next.combo &&
    prev.laneGroupCenterX === next.laneGroupCenterX &&
    prev.numberOpacity === next.numberOpacity &&
    prev.visible === next.visible
);
