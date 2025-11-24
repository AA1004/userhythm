import codecs
import sys

file_path = 'src/components/ChartEditor.tsx'

try:
    with codecs.open(file_path, 'r', 'utf-8-sig') as f:
        lines = f.readlines()

    new_lines = []
    
    # 1. Import 추가
    import_added = False
    for line in lines:
        new_lines.append(line)
        if "from '../lib/supabaseClient';" in line and not import_added:
            new_lines.append("import { useAuthContext } from '../context/AuthProvider';\n")
            import_added = True

    # 2. Hook 추가
    final_lines = []
    hook_added = False
    for line in new_lines:
        final_lines.append(line)
        if 'const [isShareModalOpen, setIsShareModalOpen] = useState' in line and not hook_added:
            final_lines.append("  const { user, signInWithGoogle } = useAuthContext();\n")
            hook_added = True

    # 3. Button 수정
    output_lines = []
    i = 0
    while i < len(final_lines):
        line = final_lines[i]
        if 'onClick={handleShareChart}' in line:
            # 버튼 태그의 시작을 찾기 위해 위로 탐색
            start_idx = i - 1
            # 닫는 태그 찾기
            end_idx = i
            while end_idx < len(final_lines) and '</button>' not in final_lines[end_idx]:
                end_idx += 1
            
            # 기존 버튼 코드 제거 (start_idx부터 end_idx까지)
            # 이미 output_lines에 들어간 start_idx 라인을 제거
            output_lines.pop()
            
            # 새 버튼 코드 삽입
            new_btn = """                {!user ? (
                  <button
                    onClick={signInWithGoogle}
                    style={{
                      flex: 1,
                      padding: '12px',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      backgroundColor: '#4285f4',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 48 48" style={{ display: 'block' }}>
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                      <path fill="none" d="M0 0h48v48H0z"/>
                    </svg>
                    로그인 후 공유
                  </button>
                ) : (
                  <button
                    onClick={handleShareChart}
                    disabled={isUploading || !shareTitle.trim() || !shareAuthor.trim()}
                    style={{
                      flex: 1,
                      padding: '12px',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      backgroundColor: (isUploading || !shareTitle.trim() || !shareAuthor.trim()) ? '#424242' : '#2196F3',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: (isUploading || !shareTitle.trim() || !shareAuthor.trim()) ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {isUploading ? '업로드 중...' : '공유하기'}
                  </button>
                )}
"""
            output_lines.append(new_btn)
            i = end_idx + 1
        else:
            output_lines.append(line)
            i += 1

    with codecs.open(file_path, 'w', 'utf-8-sig') as f:
        f.writelines(output_lines)
        
    print('Successfully updated ChartEditor.tsx')

except Exception as e:
    print(f'Error: {e}')



