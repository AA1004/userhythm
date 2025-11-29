import React from 'react';

interface ChartShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  onTitleChange: (title: string) => void;
  author: string;
  onAuthorChange: (author: string) => void;
  difficulty: string;
  onDifficultyChange: (difficulty: string) => void;
  description: string;
  onDescriptionChange: (description: string) => void;
  previewImageFile: File | null;
  previewImageUrl: string | null;
  onImageChange: (file: File | null) => void;
  isUploading: boolean;
  uploadStatus: string;
  onUpload: () => void;
  user: any;
  onLogin: () => void;
}

export const ChartShareModal: React.FC<ChartShareModalProps> = ({
  isOpen,
  onClose,
  title,
  onTitleChange,
  author,
  onAuthorChange,
  difficulty,
  onDifficultyChange,
  description,
  onDescriptionChange,
  previewImageUrl,
  onImageChange,
  isUploading,
  uploadStatus,
  onUpload,
  user,
  onLogin,
}) => {
  if (!isOpen) return null;

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    onImageChange(file);
  };

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
      onClick={onClose}
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
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>제작자 *</label>
          <input
            type="text"
            value={author}
            onChange={(e) => onAuthorChange(e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              backgroundColor: '#2a2a2a',
              color: '#fff',
              border: '1px solid #444',
              borderRadius: '6px',
            }}
            placeholder="제작자 이름"
          />
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
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>미리보기 이미지</label>
          <input
            type="file"
            accept="image/*"
            onChange={handleImageSelect}
            style={{
              width: '100%',
              padding: '8px',
              backgroundColor: '#2a2a2a',
              color: '#fff',
              border: '1px solid #444',
              borderRadius: '6px',
            }}
          />
          {previewImageUrl && (
            <img
              src={previewImageUrl}
              alt="Preview"
              style={{
                marginTop: '12px',
                maxWidth: '100%',
                maxHeight: '200px',
                borderRadius: '6px',
              }}
            />
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

