from pathlib import Path
path = Path('src/components/ChartEditor.tsx')
text = path.read_text(encoding='utf-8')
old_block = "                  const noteHeight = isHold\n                    ? Math.max(30, Math.abs(endY - startY))\n                    : 60;\n                  // \ub86a\ub178\ud2b8\ub294 startY \uc704\uce58\uc5d0\uc11c \uc2dc\uc791, \ub2e8\ub178\ud2b8\ub294 \uc911\uc559 \uc815\ub82c\n                  const topPosition = isHold ? startY : startY;"
new_block = "                  const holdCap = 24;\n                  const noteHeight = isHold\n                    ? Math.max(30, Math.abs(endY - startY)) + holdCap\n                    : 60;\n                  const topPosition = isHold\n                    ? Math.min(startY, endY) - holdCap / 2\n                    : startY;"
if old_block not in text:
    raise SystemExit('first pattern not found')
text = text.replace(old_block, new_block, 1)
old2 = "                        borderRadius: isHold ? '12px' : '8px',\n                        transform: 'translate(-50%, -50%)',"
new2 = "                        borderRadius: isHold ? '14px' : '8px',\n                        transform: isHold ? 'translateX(-50%)' : 'translate(-50%, -50%)',"
if old2 not in text:
    raise SystemExit('second pattern not found')
text = text.replace(old2, new2, 1)
path.write_text(text, encoding='utf-8')
