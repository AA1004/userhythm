import React, { useRef } from 'react';

interface ChartShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  onTitleChange: (title: string) => void;
  author: string;
  difficulty: string;
  onDifficultyChange: (difficulty: string) => void;
  description: string;
  onDescriptionChange: (description: string) => void;
  thumbnailUrl: string | null;
  isUploading: boolean;
  uploadStatus: string;
  onUpload: () => void;
  user: any;
  onLogin: () => void;
  previewStartMeasure: number;
  previewEndMeasure: number;
  onPreviewStartMeasureChange: (value: number) => void;
  onPreviewEndMeasureChange: (value: number) => void;
  beatsPerMeasure: number;
}

export const ChartShareModal: React.FC<ChartShareModalProps> = ({
  isOpen,
  onClose,
  title,
  onTitleChange,
  author,
  difficulty,
  onDifficultyChange,
  description,
  onDescriptionChange,
  thumbnailUrl,
  isUploading,
  uploadStatus,
  onUpload,
  user,
  onLogin,
  previewStartMeasure,
  previewEndMeasure,
  onPreviewStartMeasureChange,
  onPreviewEndMeasureChange,
  beatsPerMeasure,
}) => {
  const shouldCloseRef = useRef(false);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
      }}
      onPointerDown={(e) => {
        shouldCloseRef.current = e.target === e.currentTarget;
      }}
      onPointerUp={(e) => {
        if (shouldCloseRef.current && e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        style={{
          backgroundColor: '#1f1f1f',
          padding: '24px',
          borderRadius: '12px',
          maxWidth: '500px',
          width: '90%',
          maxHeight: '90vh',
          overflow: 'auto',
          color: '#fff',
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginTop: 0, marginBottom: '20px' }}>채보 공유</h2>

        {!user && (
          <div style={{ marginBottom: '20px', padding: '12px', backgroundColor: '#2a2a2a', borderRadius: '8px' }}>
            <p style={{ margin: '0 0 12px 0' }}>Google 계정으로 로그인해야 업로드할 수 있습니다.</p>
            <button
              onClick={onLogin}
              style={{
                padding: '8px 16px',
                backgroundColor: '#2196F3',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              Google 로그인
            </button>
          </div>
        )}

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>제목 *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              backgroundColor: '#2a2a2a',
              color: '#fff',
              border: '1px solid #444',
              borderRadius: '6px',
            }}
            placeholder="채보 제목"
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>제작자</label>
          <div
            style={{
              width: '100%',
              padding: '8px',
              backgroundColor: '#2a2a2a',
              color: '#fff',
              border: '1px solid #444',
              borderRadius: '6px',
              minHeight: '40px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>{user?.profile?.role === 'admin' ? '♛' : user?.profile?.role === 'moderator' ? '♝' : '♟'}</span>
            <span
              style={{
                fontWeight: user?.role === 'admin' || user?.profile?.role === 'admin' ? 'bold' : undefined,
                color: user?.role === 'admin' || user?.profile?.role === 'admin' ? '#f87171' : undefined,
              }}
            >
              {author || (user ? '이름을 불러올 수 없습니다' : '로그인 필요')}
            </span>
            {(user?.role === 'admin' || user?.profile?.role === 'admin') && (
              <span
                style={{
                  fontSize: '10px',
                  padding: '2px 6px',
                  borderRadius: '999px',
                  backgroundColor: '#b91c1c',
                  color: '#fff',
                }}
              >
                ADMIN
              </span>
            )}
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>난이도</label>
          <select
            value={difficulty}
            onChange={(e) => onDifficultyChange(e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              backgroundColor: '#2a2a2a',
              color: '#fff',
              border: '1px solid #444',
              borderRadius: '6px',
            }}
          >
            <option value="Easy">Easy</option>
            <option value="Normal">Normal</option>
            <option value="Hard">Hard</option>
            <option value="Expert">Expert</option>
            <option value="INSANE">INSANE</option>
          </select>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>설명</label>
          <textarea
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              backgroundColor: '#2a2a2a',
              color: '#fff',
              border: '1px solid #444',
              borderRadius: '6px',
              minHeight: '100px',
              resize: 'vertical',
            }}
            placeholder="채보에 대한 설명을 입력하세요"
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            하이라이트 (자막 마디 기준, 박자표: {beatsPerMeasure}/4)
          </label>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#bbb' }}>시작 마디</label>
              <input
                type="number"
                min={1}
                step={1}
                value={previewStartMeasure}
                onChange={(e) => {
                  const raw = e.target.value;
                  const n = Math.max(1, parseInt(raw || '1', 10));
                  onPreviewStartMeasureChange(n);
                  // end가 start 이하이면 자동 보정
                  if (previewEndMeasure <= n) {
                    onPreviewEndMeasureChange(n + 1);
                  }
                }}
                style={{
                  width: '100%',
                  padding: '8px',
                  backgroundColor: '#2a2a2a',
                  color: '#fff',
                  border: '1px solid #444',
                  borderRadius: '6px',
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#bbb' }}>끝 마디</label>
              <input
                type="number"
                min={2}
                step={1}
                value={previewEndMeasure}
                onChange={(e) => {
                  const raw = e.target.value;
                  const n = Math.max(previewStartMeasure + 1, parseInt(raw || String(previewStartMeasure + 1), 10));
                  onPreviewEndMeasureChange(n);
                }}
                style={{
                  width: '100%',
                  padding: '8px',
                  backgroundColor: '#2a2a2a',
                  color: '#fff',
                  border: '1px solid #444',
                  borderRadius: '6px',
                }}
              />
            </div>
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>미리보기 이미지</label>
          {thumbnailUrl ? (
            <div
              style={{
                backgroundColor: '#2a2a2a',
                padding: '12px',
                borderRadius: '8px',
              }}
            >
              <img
                src={thumbnailUrl}
                alt="YouTube Thumbnail"
                style={{
                  width: '100%',
                  maxHeight: '200px',
                  objectFit: 'cover',
                  borderRadius: '6px',
                  marginBottom: '8px',
                }}
              />
              <p style={{ margin: 0, fontSize: '12px', color: '#bbb' }}>
                유튜브 썸네일이 자동으로 사용됩니다.
              </p>
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: '12px', color: '#bbb' }}>
              유튜브 URL을 입력하면 썸네일이 자동으로 표시됩니다.
            </p>
          )}
        </div>

        {uploadStatus && (
          <div
            style={{
              marginBottom: '16px',
              padding: '12px',
              backgroundColor: uploadStatus.includes('실패') ? '#d32f2f' : '#2a2a2a',
              borderRadius: '8px',
            }}
          >
            {uploadStatus}
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={isUploading}
            style={{
              padding: '10px 20px',
              backgroundColor: '#444',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: isUploading ? 'not-allowed' : 'pointer',
              opacity: isUploading ? 0.5 : 1,
            }}
          >
            취소
          </button>
          <button
            onClick={onUpload}
            disabled={isUploading || !user}
            style={{
              padding: '10px 20px',
              backgroundColor: '#2196F3',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: isUploading || !user ? 'not-allowed' : 'pointer',
              opacity: isUploading || !user ? 0.5 : 1,
            }}
          >
            {isUploading ? '업로드 중...' : '업로드'}
          </button>
        </div>
      </div>
    </div>
  );
};

