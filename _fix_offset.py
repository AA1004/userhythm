import re

# 파일 읽기
with open('src/components/Game.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# TEST_FALL_OFFSET_MS를 3000에서 4000으로 변경
old_pattern = r'const TEST_FALL_OFFSET_MS = 3000;'
new_pattern = 'const TEST_FALL_OFFSET_MS = 4000;'
content = re.sub(old_pattern, new_pattern, content)

# 파일 쓰기
with open('src/components/Game.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('TEST_FALL_OFFSET_MS changed to 4000ms')




