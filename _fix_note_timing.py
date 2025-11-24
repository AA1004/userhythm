import re

# 파일 읽기
with open('src/components/Game.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 노트 타이밍 수정: TEST_FALL_OFFSET_MS를 빼서 노트가 일찍 나타나도록
old_pattern = r'const relativeStart = adjustedStart - startMs \+ TEST_FALL_OFFSET_MS;'
new_pattern = 'const relativeStart = adjustedStart - startMs;'
content = re.sub(old_pattern, new_pattern, content)

# 파일 쓰기
with open('src/components/Game.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('Game.tsx modified successfully')




