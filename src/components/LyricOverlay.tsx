import React, { useEffect, useMemo, useState } from 'react';
import { SubtitleCue, SubtitleStyle, ensureSubtitleFontsReady } from '../types/subtitle';

type ActiveSubtitle = {
  cue: SubtitleCue;
  opacity: number;
};

type SubtitleArea = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type LyricOverlayProps = {
  activeSubtitles: ActiveSubtitle[];
  subtitleArea: SubtitleArea;
};

export const LyricOverlay: React.FC<LyricOverlayProps> = ({
  activeSubtitles,
  subtitleArea,
}) => {
  const [fontsReady, setFontsReady] = useState(false);

  const activeFontFamilies = useMemo(
    () =>
      activeSubtitles.map(
        ({ cue }) => cue.style?.fontFamily || 'Noto Sans KR, sans-serif'
      ),
    [activeSubtitles]
  );

  useEffect(() => {
    let mounted = true;
    if (!activeFontFamilies.length) {
      setFontsReady(false);
      return;
    }

    setFontsReady(false);
    ensureSubtitleFontsReady(activeFontFamilies)
      .catch((error) => {
        console.warn('Subtitle font preparation failed:', error);
      })
      .finally(() => {
        if (mounted) setFontsReady(true);
      });

    return () => {
      mounted = false;
    };
  }, [activeFontFamilies]);

  if (!activeSubtitles.length) {
    return null;
  }

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'visible',
        pointerEvents: 'none',
        zIndex: 300,
      }}
    >
      {activeSubtitles.map(({ cue, opacity }) => {
        const style: SubtitleStyle = cue.style || ({} as SubtitleStyle);
        const pos = style.position ?? { x: 0.5, y: 0.9 };

        const left = subtitleArea.left + pos.x * subtitleArea.width;
        const top = subtitleArea.top + pos.y * subtitleArea.height;

        const transformParts: string[] = ['translate(-50%, -50%)'];
        if (style.rotationDeg) {
          transformParts.push(`rotate(${style.rotationDeg}deg)`);
        }

        const textAlign = style.textAlign ?? 'center';
        const showBackground = style.showBackground !== false;
        const bgOpacity = style.backgroundOpacity ?? 0.9;

        const bgColor = style.backgroundColor ?? '#000000';
        const backgroundColor = showBackground
          ? `rgba(${parseInt(bgColor.slice(1, 3), 16)}, ${parseInt(
              bgColor.slice(3, 5),
              16
            )}, ${parseInt(bgColor.slice(5, 7), 16)}, ${bgOpacity})`
          : 'transparent';

        return (
          <div
            key={cue.id}
            style={{
              position: 'absolute',
              left,
              top,
              transform: transformParts.join(' '),
              transformOrigin: '50% 50%',
              padding: showBackground ? '6px 14px' : 0,
              borderRadius: showBackground ? 8 : 0,
              backgroundColor,
              opacity: fontsReady ? opacity : 0,
              color: style.color ?? '#ffffff',
              fontFamily: style.fontFamily ?? 'Noto Sans KR, sans-serif',
              fontSize: style.fontSize ?? 24,
              fontWeight: style.fontWeight ?? 'normal',
              fontStyle: style.fontStyle ?? 'normal',
              textAlign,
              whiteSpace: 'pre',
              width: 'max-content',
              maxWidth: 'none',
              pointerEvents: 'none',
              boxShadow: showBackground
                ? '0 10px 30px rgba(0,0,0,0.9), 0 0 18px rgba(15,23,42,0.9)'
                : 'none',
              border:
                showBackground && style.outlineColor
                  ? `1px solid ${style.outlineColor}`
                  : 'none',
              textShadow: !showBackground
                ? '0 0 8px rgba(0,0,0,0.9), 0 2px 4px rgba(0,0,0,0.8), 0 0 20px rgba(0,0,0,0.6)'
                : 'none',
            }}
          >
            {cue.text.split('\n').map((line, idx, arr) => (
              <React.Fragment key={idx}>
                {line}
                {idx < arr.length - 1 && <br />}
              </React.Fragment>
            ))}
          </div>
        );
      })}
    </div>
  );
};
