from pathlib import Path
text_path = Path('src/components/ChartEditor.tsx')
text = text_path.read_text(encoding='utf-8')
key = '?명듃 ?좏삎'
first_idx = text.find(key)
if first_idx == -1:
    raise SystemExit('key not found')
block_start = text.rfind('          <div>', 0, first_idx)
second_idx = text.find(key, first_idx + len(key))
if second_idx == -1:
    raise SystemExit('second key not found')
second_start = text.rfind('          <div>', block_start + 1, second_idx)
if block_start == -1 or second_start == -1:
    raise SystemExit('div start not found')
text = text[:block_start] + text[second_start:]
text_path.write_text(text, encoding='utf-8')
print('deduped block')
