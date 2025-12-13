import React, { useState, useEffect } from 'react';
import { api, ApiNotice, ApiVersion } from '../lib/api';
import { CHART_EDITOR_THEME } from './ChartEditor/constants';

interface NoticeVersionAdminProps {
  onClose: () => void;
}

export const NoticeVersionAdmin: React.FC<NoticeVersionAdminProps> = ({ onClose }) => {
  const [notice, setNotice] = useState<ApiNotice | null>(null);
  const [version, setVersion] = useState<ApiVersion | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'notice' | 'version'>('notice');

  // 편집용 상태
  const [noticeTitle, setNoticeTitle] = useState<string>('');
  const [noticeContent, setNoticeContent] = useState<string>('');
  const [versionNumber, setVersionNumber] = useState<string>('');
  const [changelogItems, setChangelogItems] = useState<string[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [noticeData, versionData] = await Promise.all([
        api.getNotice(),
        api.getVersion(),
      ]);
      setNotice(noticeData);
      setVersion(versionData);
      setNoticeTitle(noticeData.title);
      setNoticeContent(noticeData.content);
      setVersionNumber(versionData.version);
      setChangelogItems(versionData.changelog);
    } catch (error) {
      console.error('Failed to load data:', error);
      alert('데이터를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveNotice = async () => {
    if (!noticeTitle.trim() || !noticeContent.trim()) {
      alert('제목과 내용을 모두 입력해주세요.');
      return;
    }

    setSaving(true);
    try {
      const updated = await api.updateNotice(noticeTitle, noticeContent);
      setNotice(updated);
      alert('공지사항이 저장되었습니다!');
    } catch (error) {
      console.error('Failed to save notice:', error);
      alert('공지사항 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveVersion = async () => {
    if (!versionNumber.trim() || changelogItems.length === 0) {
      alert('버전 번호와 변경사항을 입력해주세요.');
      return;
    }

    setSaving(true);
    try {
      const updated = await api.updateVersion(versionNumber, changelogItems);
      setVersion(updated);
      alert('버전 정보가 저장되었습니다!');
    } catch (error) {
      console.error('Failed to save version:', error);
      alert('버전 정보 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddChangelogItem = () => {
    setChangelogItems([...changelogItems, '']);
  };

  const handleRemoveChangelogItem = (index: number) => {
    setChangelogItems(changelogItems.filter((_, i) => i !== index));
  };

  const handleChangelogItemChange = (index: number, value: string) => {
    const newItems = [...changelogItems];
    newItems[index] = value;
    setChangelogItems(newItems);
  };

  if (loading) {
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: CHART_EDITOR_THEME.overlayScrim,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
        }}
      >
        <div style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '18px' }}>
          로딩 중...
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: CHART_EDITOR_THEME.backgroundGradient,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 10000,
      }}
    >
      {/* 헤더 */}
      <div
        style={{
          backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
          padding: '20px',
          borderBottom: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h1 style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '24px', margin: 0 }}>
          공지사항/버전 관리
        </h1>
        <button
          onClick={onClose}
          style={{
            padding: '10px 20px',
            fontSize: '14px',
            background: CHART_EDITOR_THEME.buttonGhostBg,
            color: CHART_EDITOR_THEME.textPrimary,
            border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
            borderRadius: CHART_EDITOR_THEME.radiusSm,
            cursor: 'pointer',
          }}
        >
          닫기
        </button>
      </div>

      {/* 탭 */}
      <div
        style={{
          backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
          borderBottom: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
          display: 'flex',
          gap: '10px',
          padding: '0 20px',
        }}
      >
        <button
          onClick={() => setActiveTab('notice')}
          style={{
            padding: '12px 24px',
            fontSize: '14px',
            fontWeight: 'bold',
            background: activeTab === 'notice' ? CHART_EDITOR_THEME.buttonPrimaryBg : CHART_EDITOR_THEME.buttonGhostBg,
            color: activeTab === 'notice' ? CHART_EDITOR_THEME.buttonPrimaryText : CHART_EDITOR_THEME.textPrimary,
            border: `1px solid ${activeTab === 'notice' ? CHART_EDITOR_THEME.accentStrong : CHART_EDITOR_THEME.borderSubtle}`,
            borderRadius: `${CHART_EDITOR_THEME.radiusSm} ${CHART_EDITOR_THEME.radiusSm} 0 0`,
            cursor: 'pointer',
            borderBottom: activeTab === 'notice' ? `2px solid ${CHART_EDITOR_THEME.accentStrong}` : 'none',
          }}
        >
          📢 공지사항
        </button>
        <button
          onClick={() => setActiveTab('version')}
          style={{
            padding: '12px 24px',
            fontSize: '14px',
            fontWeight: 'bold',
            background: activeTab === 'version' ? CHART_EDITOR_THEME.buttonPrimaryBg : CHART_EDITOR_THEME.buttonGhostBg,
            color: activeTab === 'version' ? CHART_EDITOR_THEME.buttonPrimaryText : CHART_EDITOR_THEME.textPrimary,
            border: `1px solid ${activeTab === 'version' ? CHART_EDITOR_THEME.accentStrong : CHART_EDITOR_THEME.borderSubtle}`,
            borderRadius: `${CHART_EDITOR_THEME.radiusSm} ${CHART_EDITOR_THEME.radiusSm} 0 0`,
            cursor: 'pointer',
            borderBottom: activeTab === 'version' ? `2px solid ${CHART_EDITOR_THEME.accentStrong}` : 'none',
          }}
        >
          📋 버전 리포트
        </button>
      </div>

      {/* 메인 컨텐츠 */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '40px',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div style={{ width: '100%', maxWidth: '800px' }}>
          {activeTab === 'notice' ? (
            <div>
              <h2 style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '20px', marginBottom: '20px' }}>
                공지사항 편집
              </h2>

              <div
                style={{
                  backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
                  padding: '24px',
                  borderRadius: CHART_EDITOR_THEME.radiusMd,
                  border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                  marginBottom: '20px',
                }}
              >
                <label
                  style={{
                    display: 'block',
                    color: CHART_EDITOR_THEME.textSecondary,
                    fontSize: '14px',
                    marginBottom: '8px',
                    fontWeight: '600',
                  }}
                >
                  제목
                </label>
                <input
                  type="text"
                  value={noticeTitle}
                  onChange={(e) => setNoticeTitle(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: CHART_EDITOR_THEME.radiusSm,
                    border: `1px solid ${CHART_EDITOR_THEME.inputBorder}`,
                    backgroundColor: CHART_EDITOR_THEME.inputBg,
                    color: CHART_EDITOR_THEME.textPrimary,
                    fontSize: '16px',
                    marginBottom: '20px',
                  }}
                />

                <label
                  style={{
                    display: 'block',
                    color: CHART_EDITOR_THEME.textSecondary,
                    fontSize: '14px',
                    marginBottom: '8px',
                    fontWeight: '600',
                  }}
                >
                  내용 (줄바꿈은 \n으로 표시됩니다)
                </label>
                <textarea
                  value={noticeContent}
                  onChange={(e) => setNoticeContent(e.target.value)}
                  rows={12}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: CHART_EDITOR_THEME.radiusSm,
                    border: `1px solid ${CHART_EDITOR_THEME.inputBorder}`,
                    backgroundColor: CHART_EDITOR_THEME.inputBg,
                    color: CHART_EDITOR_THEME.textPrimary,
                    fontSize: '14px',
                    resize: 'vertical',
                    fontFamily: 'inherit',
                  }}
                />

                {notice && (
                  <div
                    style={{
                      marginTop: '16px',
                      padding: '12px',
                      backgroundColor: CHART_EDITOR_THEME.surface,
                      borderRadius: CHART_EDITOR_THEME.radiusSm,
                      fontSize: '12px',
                      color: CHART_EDITOR_THEME.textMuted,
                    }}
                  >
                    마지막 업데이트: {new Date(notice.updatedAt).toLocaleString('ko-KR')}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  onClick={onClose}
                  style={{
                    padding: '12px 24px',
                    fontSize: '14px',
                    background: CHART_EDITOR_THEME.buttonGhostBg,
                    color: CHART_EDITOR_THEME.textPrimary,
                    border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                    borderRadius: CHART_EDITOR_THEME.radiusSm,
                    cursor: 'pointer',
                  }}
                >
                  취소
                </button>
                <button
                  onClick={handleSaveNotice}
                  disabled={saving}
                  style={{
                    padding: '12px 24px',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    background: saving ? CHART_EDITOR_THEME.buttonGhostBg : CHART_EDITOR_THEME.buttonPrimaryBg,
                    color: saving ? CHART_EDITOR_THEME.textSecondary : CHART_EDITOR_THEME.buttonPrimaryText,
                    border: 'none',
                    borderRadius: CHART_EDITOR_THEME.radiusSm,
                    cursor: saving ? 'not-allowed' : 'pointer',
                  }}
                >
                  {saving ? '저장 중...' : '저장'}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <h2 style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '20px', marginBottom: '20px' }}>
                버전 리포트 편집
              </h2>

              <div
                style={{
                  backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
                  padding: '24px',
                  borderRadius: CHART_EDITOR_THEME.radiusMd,
                  border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                  marginBottom: '20px',
                }}
              >
                <label
                  style={{
                    display: 'block',
                    color: CHART_EDITOR_THEME.textSecondary,
                    fontSize: '14px',
                    marginBottom: '8px',
                    fontWeight: '600',
                  }}
                >
                  버전 번호
                </label>
                <input
                  type="text"
                  value={versionNumber}
                  onChange={(e) => setVersionNumber(e.target.value)}
                  placeholder="예: 1.0.0"
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: CHART_EDITOR_THEME.radiusSm,
                    border: `1px solid ${CHART_EDITOR_THEME.inputBorder}`,
                    backgroundColor: CHART_EDITOR_THEME.inputBg,
                    color: CHART_EDITOR_THEME.textPrimary,
                    fontSize: '16px',
                    marginBottom: '24px',
                  }}
                />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <label
                    style={{
                      color: CHART_EDITOR_THEME.textSecondary,
                      fontSize: '14px',
                      fontWeight: '600',
                    }}
                  >
                    변경사항
                  </label>
                  <button
                    onClick={handleAddChangelogItem}
                    style={{
                      padding: '6px 12px',
                      fontSize: '12px',
                      background: CHART_EDITOR_THEME.buttonGhostBg,
                      color: CHART_EDITOR_THEME.textPrimary,
                      border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                      borderRadius: CHART_EDITOR_THEME.radiusSm,
                      cursor: 'pointer',
                    }}
                  >
                    + 추가
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {changelogItems.map((item, index) => (
                    <div key={index} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <input
                        type="text"
                        value={item}
                        onChange={(e) => handleChangelogItemChange(index, e.target.value)}
                        placeholder={`변경사항 ${index + 1}`}
                        style={{
                          flex: 1,
                          padding: '10px',
                          borderRadius: CHART_EDITOR_THEME.radiusSm,
                          border: `1px solid ${CHART_EDITOR_THEME.inputBorder}`,
                          backgroundColor: CHART_EDITOR_THEME.inputBg,
                          color: CHART_EDITOR_THEME.textPrimary,
                          fontSize: '14px',
                        }}
                      />
                      <button
                        onClick={() => handleRemoveChangelogItem(index)}
                        style={{
                          padding: '10px 16px',
                          fontSize: '14px',
                          background: CHART_EDITOR_THEME.danger,
                          color: '#fff',
                          border: 'none',
                          borderRadius: CHART_EDITOR_THEME.radiusSm,
                          cursor: 'pointer',
                        }}
                      >
                        삭제
                      </button>
                    </div>
                  ))}
                  {changelogItems.length === 0 && (
                    <div
                      style={{
                        padding: '20px',
                        textAlign: 'center',
                        color: CHART_EDITOR_THEME.textMuted,
                        fontSize: '14px',
                      }}
                    >
                      변경사항이 없습니다. 위의 "+ 추가" 버튼을 클릭하여 추가하세요.
                    </div>
                  )}
                </div>

                {version && (
                  <div
                    style={{
                      marginTop: '16px',
                      padding: '12px',
                      backgroundColor: CHART_EDITOR_THEME.surface,
                      borderRadius: CHART_EDITOR_THEME.radiusSm,
                      fontSize: '12px',
                      color: CHART_EDITOR_THEME.textMuted,
                    }}
                  >
                    마지막 업데이트: {new Date(version.updatedAt).toLocaleString('ko-KR')}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  onClick={onClose}
                  style={{
                    padding: '12px 24px',
                    fontSize: '14px',
                    background: CHART_EDITOR_THEME.buttonGhostBg,
                    color: CHART_EDITOR_THEME.textPrimary,
                    border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                    borderRadius: CHART_EDITOR_THEME.radiusSm,
                    cursor: 'pointer',
                  }}
                >
                  취소
                </button>
                <button
                  onClick={handleSaveVersion}
                  disabled={saving}
                  style={{
                    padding: '12px 24px',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    background: saving ? CHART_EDITOR_THEME.buttonGhostBg : CHART_EDITOR_THEME.buttonPrimaryBg,
                    color: saving ? CHART_EDITOR_THEME.textSecondary : CHART_EDITOR_THEME.buttonPrimaryText,
                    border: 'none',
                    borderRadius: CHART_EDITOR_THEME.radiusSm,
                    cursor: saving ? 'not-allowed' : 'pointer',
                  }}
                >
                  {saving ? '저장 중...' : '저장'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

