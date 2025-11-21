from pathlib import Path
text = Path('src/components/ChartEditor.tsx').read_text(encoding='utf-8')
print('?명듃 occurrences', text.count('?명듃'))
print('?좏삎 occurrences', text.count('?좏삎'))
