from pathlib import Path
text = Path('src/components/ChartEditor.tsx').read_text(encoding='utf-8')
needle = "          <div>\r\n            <div style={{ color: '#fff', marginBottom: '10px', fontWeight: 'bold' }}>\r\n              ?명듃 媛쒖닔\r\n            </div>\r\n            <div style={{ color: '#aaa', fontSize: '14px' }}>{notes.length}媛?/div>\r\n          </div>\r\n\r\n          <div>\r\n            <div style={{ color: '#fff', marginBottom: '10px', fontWeight: 'bold' }}>\r\n              以?r\n            </div>\r\n"
print('found', needle in text)
