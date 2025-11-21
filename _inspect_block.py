from pathlib import Path
text = Path('src/components/ChartEditor.tsx').read_text(encoding='utf-8')
key = '\ub178\ud2b8 \uc720\ud615'
idx = text.index(key)
start = text.rfind('          <div>', 0, idx)
print(repr(text[start:idx+200]))
