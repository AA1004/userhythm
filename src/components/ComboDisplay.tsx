import React from 'react';

interface ComboDisplayProps {
  combo: number;
  laneGroupCenterX: number;
  numberOpacity: number;
  visible: boolean;
  topOffset?: number;
}

const ComboDisplayComponent: React.FC<ComboDisplayProps> = ({
  combo,
  laneGroupCenterX,
  numberOpacity,
  visible,
  topOffset = 0,
}) => {
  if (!visible || combo <= 0) return null;

  return (
    <div
      className="combo-display"
      style={
        {
          left: `${laneGroupCenterX}px`,
          top: `${118 + topOffset}px`,
          '--combo-number-opacity': numberOpacity,
        } as React.CSSProperties
      }
      aria-label={`Combo ${combo}`}
    >
      <span className="combo-display__number">
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
    prev.visible === next.visible &&
    prev.topOffset === next.topOffset
);
