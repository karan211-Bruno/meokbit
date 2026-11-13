# 먹빛 (Meokbit) v2.0.0 — AINOTE 2 스타일 E-Ink AI 회의 · 필기 · 전사 스튜디오

**먹빛(Meokbit) v2.0.0**은 종이 질감 E-Ink 홈 런처와 **실시간 분할 화면 음성 전사**, **화자 식별·일괄 이름 변경**, **타임마크 + Click-to-Speak**, **1-탭 AI Meeting Minutes**, **오디오 분리 내보내기 (`Files > Audio`)**를 Android · iPadOS · 웹(PWA) 환경에서 구현한 독립 오리지널 AI 노트 스튜디오입니다.

> 본 프로젝트는 공개된 디지털 노트 워크플로우를 참고하여 독립적으로 설계·구현한 오리지널 소프트웨어이며, 특정 제조사와 무관합니다.

---

## v2.0.0 주요 기능

1. **2열 E-Ink 홈 런처 (`src/components/HomeLauncher.tsx`)**
   - 폴더 필터(`All`, `Default`, `Meetings`, `Personal Goals`, `Projects`), 빠른 템플릿, PDF/TXT 불러오기, 하단 독(`Notes`, `Schedule`, `Reading`, `MindMap`, `Files > Audio`, `Settings`)

2. **상단 도킹 분할 전사·오디오 플레이어 (`src/components/TranscriptionPopup.tsx`)**
   - `•••••` 핸들 드래그로 높이 조절 및 상단 축소/숨김 (`⌃ 숨김` 후에도 백그라운드 녹음 유지, `🎙` 필로 복귀)
   - 실시간 웨이브폼, `🏷 Tag` 타임마크 기록, 배속(`1x~2x`), 스크러버 위 클릭 가능한 태그 점, **재생 구간 반전 하이라이트**
   - **화자 구분(`👥 화자`) & 화자 이름 변경 모달**: 화자 배지 탭 → **`Only modify here`** (현재 구간만) vs **`The modification applies to the whole article`** (전체 문서 일괄 변경)

3. **16개어 전사 & 10개어 상호 번역 모드 (`src/components/LanguageModeModal.tsx`)**
   - 한국어·영어·일본어·중국어 등 16개어(`Offline` pack 배지 포함) 선택 + 자주 쓰는 번역 쌍(`+ Add Mode`) 영구 저장 및 `원문 | 번역 | 원문+번역` 전환

4. **Click-to-Speak 타임마크 & 필기-음성 동기화 (`src/components/InkCanvas.tsx`)**
   - `⋮` 메뉴의 **Show text-audio sync markers** / **Click-to-Speak** 옵션 지원
   - 필기 밑의 점선 동기화 마커, 페이지 여백 `00:01:23` 타임마크 배지, 또는 녹음 중 작성한 손글씨 획을 탭하면 **즉시 해당 음성 시점부터 오디오 재생**
   - 만년필(필압+속도)·볼펜·연필·붓펜·형광펜, `↶`/`↷` Undo/Redo, `⬚` 올가미 AI 검색/마크다운/To-Do

5. **1-탭 `✦ AI Aide` → 전체 화면 `Meeting Minutes` (`src/components/MeetingMinutesView.tsx`)**
   - `Date`, `Attendees` (변경된 화자 이름 자동 반영), `Agenda`, `Key Discussion Points`, `Quote`, `Items to be Confirmed`, `Action Items` 구조화 생성 + `T` 직접 편집 + **`Insert into note`** (`Completed` 알림) + 실행과제 To-Do 일괄 등록

6. **`⤴ Share` 오디오 분리 내보내기 (`src/components/ShareExportModal.tsx`) & `⟲ Retranscribe` (`src/components/RetranscribeModal.tsx`)**
   - `Web (MD)`, `PDF`, `Text (.txt)` 외에도 **Recording Files**(`WAV` / `MP3` / `WebM`) 별도 오디오 추출 및 `Files > Audio` 보관함 저장
   - `Retranscribe`: `Complete the transcription` / `All rewind`, `Multiplayer mode`, **`Tips` 덮어쓰기 확인 대화상자** → `"Voice to text conversion successful"`

---

## 설치파일 및 실행 방법

- 자세한 설치 안내는 [`설치-및-사용-안내.md`](설치-및-사용-안내.md)를 참고하세요.
- **GitHub Releases (v2.0.0)**: `meokbit-2.0.0-android.apk`, `meokbit-2.0.0-ios-unsigned.ipa`, `meokbit-2.0.0-source.zip`

## 로컬 빌드

```bash
npm install
npm run build         # dist/ 생성
npm run native:sync   # Android/iOS Capacitor 동기화
```
