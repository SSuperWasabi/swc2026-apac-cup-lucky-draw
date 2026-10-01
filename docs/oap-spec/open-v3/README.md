# 소환서 오픈 화면 v3 — 앱 적용 명세

원본: `swc2026_OPEN_YOUR_SCROLL_iPad_v3_260923.aep` / 컴포지션 `04_Caster_Cam2_OPEN_SCROLL_IPAD_FRAME_V3`, `_IDLE_V3`, `_OPEN_V3` (2048×2732, 30fps).

- [layout.json](layout.json): `scripts/ae/build-open-v3-spec.cjs`가 AE v3 폴더의 `layout.json`과 스크립트 추출본으로 생성한다. 영상 칸은 AE 레이어 변환(720 소스 × 245.556% = 1768)으로 다시 계산해 AE 좌표와 대조한다.

## 구성

| 구분 | 내용 |
| --- | --- |
| 프레임 반복 영상 | `FRAME_V3` 152프레임(5.067초). 제목·GOOD LUCK·로고·엠블럼·배경·SLIDE TO OPEN THE SCROLL 바를 굽는다. v10부터 영상 칸·SLIDE 바를 64 master px 위로 올려 렌더(`render-comp.jsx`의 `moveY`, 배경·헤더는 그대로). 영상 칸은 모든 프레임에서 완전한 검정이라 소환서 영상을 위에 얹으면 AE와 같은 합성이 된다. 1024×1366 H.264 High 4.1, 0.56MB, 반복 경계 매끄러움 |
| 소환서 영상 | 칸 (140, 531) 1768×1768(AE 원본 595에서 −64). `sacred-idle.mp4`(101/30초 반복)와 `sacred-open.mp4`(드래그 진행률 → 재생 위치). 앱의 기존 파일이 AE 소스와 동일하다(PSNR ∞) |
| 드래그 UI | AE 예약 영역 (284, 2111) 1480×150(원본 2175에서 −64). 동작은 기존과 같다(손잡이 좌측 고정, 화살표 10개 순차 점등, 드래그 진행률 연동). v10 스타일: 불투명도 75% 글래스모피즘(흰 반투명 그라데이션, `backdrop-filter: blur(14px) saturate(170%)`, 1px 흰 테두리), 유리 손잡이, 보라 점·화살표, 흰 레일·셰브런 |
| 자동 오픈 | 레이아웃 C(2026-09-28 사용자 결정): SLIDE 바 아래 빈 띠 중앙에 작은 알약형 `AUTO OPEN ▶▶` 버튼(높이 140, top 2472 — v10에서 64 위로). 1.8배속 자동 오픈. 오픈 중에는 흐리게 비활성. 시안 비교: `resource/oap/mockups/auto-open-options.png` |
| 뒤로 | `← BACK`(선택 화면으로). 엠블럼 위 흰 여백에 HOME과 같은 위치·크기, SLIDE 바와 같은 갈색 |

## AE에 없어 앱에서 정한 것

- BACK 버튼
- 영상 재생 실패 시 화면 중앙 안내 `VIDEO STOPPED / TAP THE SCROLL TO RETRY`, 소환서를 누르면 확정된 추첨 그대로 다시 재생(재추첨 없음)
- 기존 보라색 소환 반지·입자·섬광과 한국어 안내 문구는 제거했다(이미 오픈 화면에서는 숨겨져 있었다)

## 검증 (Chrome, `scripts/test-open-browser.cjs`, DPR 2)

- 영상 칸·드래그 영역·AUTO OPEN이 `layout.json`(appliedShiftY −64) 좌표와 ±0.6px 이내
- 프레임 영상과 소환서 대기 영상을 t=1초에 맞춰 AE `IDLE_V3` t=1초(앱 쪽을 64px 보정)와 비교: 소환서 칸 45dB대, 헤더 29.8dB(기준 28dB, 글자 영역의 영상 압축 차이)
- 재생 실패 시 중앙 안내, 소환서 탭으로 다시 재생(로그 추가 없음), BACK으로 선택 화면 복귀 시 프레임 영상 정지
- 드래그·자동 오픈·오디오는 기존 `test-figure-browser`, `test-figure-dom`이 계속 검사

## 남은 확인

- iPad에서 프레임 영상과 소환서 영상 2개 동시 디코딩 부하, 첫 진입 지연
- iPad에서 AUTO OPEN 버튼 크기·위치 확인

## v22 변경 (사용자 확정: SLIDE 박스 B안)

- SLIDE TO OPEN THE SCROLL 박스를 AE에서 다시 렌더했다.
  - 색: 딥 퍼플 `#3B1766`, 글자 골드 `#FFE58D`
  - 크기: 높이 120 → 180, 글자 58 → 72, 방패 아이콘은 같은 비율로 확대
  - 박스 윗변(2299)은 그대로이고, 방패와 글자를 박스 가운데에 다시 맞췄다.
  - AUTO OPEN이 있던 아래 빈 공간으로 늘어난다.
- 드래그 UI: 높이 150 → 200(아래 끝 2261 유지), 손잡이 폭 24%, 쉐브론 선 12 → 15px, 손잡이 화살표 확대.
- 시안 비교(현재·A~D): `resource/oap/mockups/slide-bar/slide-bar-options.png`
- 이전 프레임 영상: `resource/oap/ae-work/render/open-v3-barB/open-frame-loop-v21.mp4`

## v30 변경: 소환서 터치음

- **목적:** 드래그가 빠르면 개봉 영상에 맞춘 긁는 소리가 "휘리릭" 지나가 임팩트가 약하다. 누르는 순간에 확실한 소리를 준다.
- **원본:** `resource/audio/final-assets/`
  - `Magical flash impact_1.wav`(5.6초)
  - `Magical flash rumble_1.wav`(9.6초, 4초 동안 −8dB로 크게 지속)
  - `Magical flash chime tail_1.wav`(6.2초)
- **앱용 가공(`app/assets/figure/`):** 48kHz 모노, 리미터로 최대 −1dB
  - `open-touch-all.wav`: 임팩트 1.0 + 럼블 0.55 + 차임 0.8, 4.5초(3.0초부터 페이드아웃)
  - `open-touch-hit.wav`: 임팩트 + 럼블, 4.5초
  - `open-touch-chime.wav`: 차임 0.9, 3.5초(2.2초부터 페이드아웃)
  - 가공 이유: 그대로 겹치면 클리핑되고, 럼블이 길게 남아 축하음·특별 영상·당첨음을 덮는다.
- **재생 시점:**
  - 소환서를 누르는 순간(`beginScrollScrub`, 키보드 자동 개봉 포함)에 재생한다.
  - 1.2초 안에 다시 눌러도 다시 울리지 않는다.
  - 개봉(흰 섬광, `finishScrollReveal`) 때 0.9초 동안 줄어든다.
  - 끝까지 열지 않고 손을 떼면(`startScrollLoop`) 0.4초 동안 줄어든다.
- **방식(관리자 → 설정 → 효과음 → 소환서 터치음):**
  - 한 번에(기본): 터치 순간 3종을 함께 낸다.
  - 나눠서: 터치 순간 임팩트·럼블, 개봉 순간 차임
  - 끄기
- **볼륨:** "소환서 터치음" 볼륨(▶ 듣기) × 효과음 전체 × 연출 소리
- **재생 경로:** `ScrollSound.fx/fadeFx`. 긁는 소리·연출 영상 소리의 `stop()`과 따로 관리해 서로 끊지 않는다.
- **비교용 미리듣기:** `resource/oap/mockups/open-touch/`
