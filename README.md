# SWC2026 APAC Cup Lucky Draw App

Figure Draw v32를 계승한 SWC2026 APAC Cup용 독립 PWA 프로젝트.

- 프로젝트 시작일: 2026-09-23
- 현재 버전: `swc-apac-v1` / 캐시: `swc2026-apac-lucky-draw-v1`
- 기반 커밋: `ac2d609cb584ce21ed35a8b32183f80605828791` (Figure Draw v32 기능 + 사용자 확인 문서)
- 작업 폴더: `F:\Download\SWC2026 APAC Cup_Lucky Draw App`
- 새 저장소: https://github.com/SSuperWasabi/swc2026-apac-cup-lucky-draw
- 앱 배포 주소: https://ssuperwasabi.github.io/swc2026-apac-cup-lucky-draw/app/
- 시작할 때 읽을 문서: [handoff.md](handoff.md)

## 지금 완료한 범위

기존 앱 코드·Git 이력·테스트·로컬 리소스를 복제하고 새 앱 식별자를 분리했다. 기존 앱 저장소와 운영 데이터는 변경하지 않는다. 새 앱은 미디어 등록 없음, 재고 0, 추첨 기록 없음으로 시작한다. 기본 두 상품 행은 등록 안내용 빈 틀이며 운영 경품이 아니다.

다수 당첨 상품을 등록할 수 있는 기존 추첨 엔진·관리자 기능을 유지했다. 내부 `kind:figure`는 당첨 경품 분류를 뜻하며 실제 상품이 피규어일 필요는 없다. 당첨 문구는 일반 경품 문구로 바꾸고, 이미지가 없는 당첨 상품에 제라투 이미지를 대신 표시하지 않는다. 기존 관리자 일부 "피규어" 명칭과 보라색 화면·소환 영상·아이콘은 기반 앱의 임시 디자인이며 새 OAP 브랜딩 적용 완료를 뜻하지 않는다.

메인 다음 영상 사전 디코딩, 단일 미당첨 영상 재사용, 소환서 드래그/자동 오픈, 오디오, 재고·기록 저장, 백업 호환성은 유지한다.

## 새 행사 설정

1. 관리자 진입: 메인 좌측 상단을 3초 안에 5회 터치. 초기 PIN은 `0000`이며 운영 전에 변경한다.
2. 새 행사의 당첨 경품·참가상과 실제 수량을 등록한다. 테스트용 수량을 행사 수량으로 사용하지 않는다.
3. 기본 추첨은 잔여 재고 비례이며 별도 확률·쿨다운·시간 배분은 기본 비활성이다. 운영 규칙 확정 후 필요할 때 설정한다.
4. 기존 `.kuji` 파일은 호환되지만 **가져오면 기존 행사명·재고·추첨 기록도 복원된다.** 새 행사 초기화가 목적이므로 확인 없이 가져오지 않는다.
5. 새 행사의 운영 데이터를 준비한 뒤 새 `.kuji` 백업을 만든다. 기존 백업은 보관하고 덮어쓰지 않는다.

설정은 기기별 localStorage/IndexedDB에 저장된다. 다수 상품 지원은 여러 기기의 재고 동기화를 의미하지 않는다. 운영 중 사이트 데이터 삭제나 앱 재설치 전에 백업한다.

## 기존 앱과 분리한 항목

| 항목 | 새 값 |
| --- | --- |
| 설정·재고·로그·쿨다운 키 | `swc2026-apac-lucky-draw.*` |
| 미디어 IndexedDB | `swc2026-apac-lucky-draw-media` |
| Service Worker 캐시 접두사 | `swc2026-apac-lucky-draw-` |
| PWA id | 앱 경로 아래 `./swc2026-apac-lucky-draw` |
| 시작 경로 / scope | `./index.html` / `./` |
| 비교용 과거 화면 | `swc2026-apac-review-v8/v9/v11.*` |

기존 Figure Draw의 저장 키·DB·캐시는 읽거나 삭제하지 않는다. 같은 GitHub Pages 도메인에서도 저장소 경로만 다르게 만드는 것으로 끝내지 않고 위 이름을 분리했다. 비교용 과거 화면은 새 앱 미디어를 읽기 전용으로 참조한다.

## OAP 원본과 로컬 자료

- AE 원본 기준: `C:\Users\jasonbae\Downloads\(0709) swc2026_oap_APAC_Final`
- 복사한 OAP 파생 자료: `resource/oap/ae-choose-your-scroll-260922/`
- 기존 로컬 리소스: `resource/images`, `resource/videos`, `resource/audio`, `resource/fonts` 등
- 실제 앱 배포에 쓰는 최적화 자산: `app/assets/`

`resource/`, `.tools/`, `.kuji` 백업과 AE 원본은 Git 공개 대상에서 제외한다. GitHub만 복제하면 이 로컬 자료는 따라오지 않는다. 새로 발견한 선택 화면 v8, 개봉 화면 v3, 당첨 화면 v5 AE 파일은 파일명상 최신 후보이며 아직 열어서 검증하거나 앱에 적용하지 않았다. v7을 자동으로 최종 디자인으로 단정하지 않는다.

## 검증과 개발

Node.js와 Google Chrome이 필요하다. 현재 복제본에는 기존 검증 도구를 로컬 복사해 두었다. GitHub에서 새로 복제한 경우 다음으로 도구를 설치한다.

```powershell
powershell -File scripts/setup-tests.ps1
node scripts/test-project-isolation.cjs
node scripts/test-figure.cjs
node scripts/test-figure-dom.cjs
node scripts/test-idle-video-cycle.cjs
node scripts/test-scroll-audio.cjs
node scripts/test-audio-mix.cjs
node scripts/test-figure-sw.cjs
node scripts/test-figure-browser.cjs
node scripts/test-idle-video-browser.cjs
node scripts/test-result-video-browser.cjs
```

브라우저 검사는 격리된 Chrome 프로필과 임시 로컬 서버를 사용하며 실제 운영 데이터에 접근하지 않는다. 인코딩 검사는 `node scripts/test-scroll-encoding.cjs`이며 로컬 ffmpeg 또는 `FFMPEG` 환경변수가 필요하다. `test-tools/package-lock.json`은 검증 의존성을 고정한다.

배포 후 검사: `node scripts/test-project-pwa-browser.cjs https://ssuperwasabi.github.io/swc2026-apac-cup-lucky-draw/app/` — 별도 Chrome 프로필에서 새 PWA 식별자, 캐시, 빈 행사, 타 앱 키 보존, 오프라인 재실행과 영상 Range 응답을 확인한다.

최종 실물 iPad/PWA 확인은 새 앱 주소에서 별도로 필요하다. 기반 v32의 사용자 확인을 새 프로젝트의 실기 검증으로 대신 기록하지 않는다.

## 문서·공유

- [현재 인수인계 및 다음 작업](handoff.md)
- [전체 작업 일지](WORKLOG.md)
- [기반 Figure Draw v32 README 보존본](README-FIGURE-DRAW-v32.md)
- [기반 미당첨 영상 영향 검토](RESULT-VIDEO-IMPACT-REVIEW.md)
- [기반 전체 작업 참고 자료](<writing reference/figure-draw-work-reference.md>)

과거 문서에 있는 앱 주소·버전·C/F 경로는 해당 시점의 이력이다. 새 프로젝트의 최신 기준은 이 README와 handoff.md다. 공유 ZIP은 아직 만들지 않았다. 필요 시 `scripts/create-share.ps1`로 생성하되 원본/후보 미디어 포함 범위와 전달 권한을 검토한다.

## 다음 단계

기반 기능 검증 후 최신 AE 원본의 화면별 버전을 확정하고, 선택 화면을 **배경 루프 영상 1개 + 개별 이미지 버튼·카드 + 웹 등장 애니메이션**으로 구현한다. 배치·크기·투명 여백·키프레임·이징·입력 활성화 시점을 먼저 추출한다. 새 경품별 개봉·당첨 연출은 그 다음에 검토한다.
