import re

# 파일 읽기
with open('src/components/Game.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. 상수 추가
if 'TEST_FALL_OFFSET_MS' not in content:
    content = content.replace(
        'const START_DELAY_MS = 2000;',
        'const START_DELAY_MS = 2000;\nconst TEST_FALL_OFFSET_MS = 3000;'
    )

# 2. handleEditorTest에서 노트 시간에 오프셋 추가
content = re.sub(
    r'const relativeStart = adjustedStart - startMs;',
    'const relativeStart = adjustedStart - startMs + TEST_FALL_OFFSET_MS;',
    content
)

# 3. YouTube 플레이어 초기화 시 오프셋 적용 (첫 번째: onReady에서)
content = re.sub(
    r'const startTimeSec = startTimeMs / 1000;(\s+)// 재생 속도 설정(\s+)player\.setPlaybackRate',
    r'const startTimeSec = Math.max(0, (startTimeMs - TEST_FALL_OFFSET_MS) / 1000);\1// 재생 속도 설정\2player.setPlaybackRate',
    content
)

# 4. YouTube 플레이어 재생 시작 시 오프셋 적용 (두 번째: initialPlayAttempt에서)
content = re.sub(
    r'const startTimeSec = startTimeMs / 1000;(\s+)// 재생 속도 설정(\s+)testYoutubePlayer\.setPlaybackRate',
    r'const startTimeSec = Math.max(0, (startTimeMs - TEST_FALL_OFFSET_MS) / 1000);\1// 재생 속도 설정\2testYoutubePlayer.setPlaybackRate',
    content
)

# 5. YouTube 동기화 루프에서 오프셋 적용
content = re.sub(
    r'const desiredSeconds =\s+\(\(testAudioSettingsRef\.current\?\.startTimeMs \|\| 0\) \+ currentGameTime\) / 1000;',
    'const desiredSeconds = Math.max(0, ((testAudioSettingsRef.current?.startTimeMs || 0) + currentGameTime - TEST_FALL_OFFSET_MS) / 1000);',
    content
)

# 파일 쓰기
with open('src/components/Game.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('Game.tsx modified successfully')

