# 화면 전환 영상 — 앱 적용 명세

원본: OAP 최종 폴더 `(Footage)/@TRANS_ASIA/TRANS_ASIA_#####.png` (알파 PNG 시퀀스, 가로형, 30fps). AE 가로형 전환 컴포지션의 프레임 f = PNG 프레임 f+6이다.

## 자산 (v20)

| 파일 | 내용 |
| --- | --- |
| `app/assets/oap/transition/transition-color.mp4` | premultiplied 색(투명 = 완전한 검정), 768×1024, 54fps, 61프레임, 0.50MB |
| `app/assets/oap/transition/transition-matte.mp4` | 1 − 알파(투명 = 흰색, 가림 = 검정), 768×1024, 54fps, 61프레임, 0.05MB |

- 세로 변환: 높이 1024에 맞춘 뒤 가운데를 잘랐다. 1~6번째 PNG는 버리고, 끝에 투명 프레임 2장을 덧붙였다. AE 소스 색을 그대로 쓴다.
- 1.8배속(v11 사용자 결정): 원본 61프레임을 하나도 버리지 않고 54fps(=30×1.8)로 인코딩했다.
- H.264 High 4.1, CRF 14, GOP 27.
- 원본 AE 확인: `swc2026_oap`, Astra revised, 그 자동 저장본 모두 `01_Transition`은 TRANS_ASIA PNG 레이어 하나다.

```
# 색
ffmpeg -framerate 54 -start_number 6 -i TRANS_ASIA_%05d.png -vf "format=rgba,tpad=stop=2:stop_mode=add:color=0x00000000,scale=-2:1024:flags=lanczos,crop=768:1024,setsar=1,premultiply=inplace=1,format=yuv420p" <공통> transition-color.mp4
# 매트
ffmpeg -framerate 54 -start_number 6 -i TRANS_ASIA_%05d.png -vf "format=rgba,tpad=stop=2:stop_mode=add:color=0x00000000,scale=-2:1024:flags=lanczos,crop=768:1024,setsar=1,format=rgba,alphaextract,negate,format=yuv420p" <공통> transition-matte.mp4
# 공통: -c:v libx264 -profile:v high -level:v 4.1 -preset slow -crf 14 -g 27 -keyint_min 27 -sc_threshold 0 -r 54 -enc_time_base 1:54 -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv -an -movflags +faststart
```

## 앱 동작 (`app/transition.js`, swc-apac-v20)

- **브라우저가 직접 재생·합성한다.** 두 영상을 페이지 맨 위에 겹쳐 놓고 CSS 블렌드로 합성한다.
  - 매트: `mix-blend-mode: multiply` → 페이지 × (1 − 알파)
  - 색: `plus-lighter`(미지원이면 `screen`) → + 색 × 알파
  - 결과는 "색을 알파로 페이지 위에 올린 것"과 같다.
  - `screen`은 반투명 가장자리에서만 오차가 있다. 원본의 반투명 픽셀은 평균 0.24%, 최대 1.45%다.
- **v19까지의 방식과 차이:** v19까지는 JavaScript가 매 프레임 영상을 읽어 WebGL로 그렸다. 그래서 메인 스레드가 바쁘면(화면 교체 순간 60~276ms 멈춤) 전환이 멈췄다가 튀었다(iPad "뚝뚝 끊김").
  - Chrome에서 CPU를 4배 늦춰 측정한 결과, 61프레임 중 실제로 그린 프레임:
    - v19: 26~33프레임
    - v20: 53~61프레임
  - v20은 메인 스레드를 300ms 막아도 영상이 0.3초 계속 진행된다.
- 메인 스레드는 화면 교체 시점만 읽는다: 색 영상의 `requestVideoFrameCallback` 미디어 시간이 13/54초면 교체, 48/54초면 다음 화면 등장.
- 두 영상의 동기: 둘 다 디코딩된 0초 프레임에 멈춰 있다가 같은 틱에 재생한다. 정상 속도와 CPU 4배 저속 각 3회 측정에서 두 영상이 보여 준 프레임 차이는 모두 0이었다.
  - 재생 속도를 미세 조정해 따라가게 하는 보정도 시험했지만, 저속에서 오히려 1프레임 차이를 계속 만들어 넣지 않았다.
  - 완전히 덮는 구간(11~48)은 매트가 전부 검정이라, 어긋나도 보이지 않는다.
- 시작 시 두 영상을 메모리(Blob)에 올리고 한 번 재생해 디코더를 깨운 뒤 0초에 멈춰 둔다. 매 전환이 끝나면 바로 되감는다.
- 전환 중에는 `#transition-shield`가 입력을 막는다.
- 실패 대비: 재생이 거부되면 바로 이동한다. 4초 감시 타이머가 있어서 영상이 멈춰도 이동은 반드시 끝난다.
- 페이지와 두 영상 사이에 쌓임 맥락(stacking context)을 만드는 요소가 있으면 블렌드가 깨진다. 두 영상은 `body` 바로 아래에 둔다.

| 이동 | 전환 |
| --- | --- |
| 대기 → 선택 (배너 탭) | 적용 |
| 선택 → 오픈 (NEXT), 선택 화면을 숨긴 설정의 대기 → 오픈 | 적용 안 함(v21 팀 피드백) |
| 오픈 → 선택 (BACK) | 적용 안 함(v21) |
| 선택 → 대기 (HOME) | 적용 안 함(v21) |
| 결과(당첨 영상·카드·참가상) → 대기 (탭·자동 복귀) | 적용 |
| 오픈 → 결과 | 적용 안 함. 기존 흰 화면 + 특별 영상(시네마틱) 연출 유지 |
| 관리자·백그라운드 탭 | 적용 안 함 |

관리자 `현장 운영 > 화면 전환 영상` 스위치(`cfg.screenTransitions`, 기본 켬)로 끌 수 있다.

## 검증 (Chrome, `scripts/test-transition-browser.cjs`)

- 두 영상 모두 61프레임·54fps이고, 메모리에서 재생한다. 블렌드 모드: multiply / plus-lighter.
- 대기 → 선택:
  - 화면이 덮인 뒤(영상 t ≥ 11/54초) 바뀐다.
  - 등장은 t ≥ 0.84초에 시작한다.
  - 끝나면 레이어를 숨기고 되감는다.
- 합성 정확도: 두 영상의 실제 인코딩 프레임(8 반투명 진입, 30 완전 가림, 52 반투명 이탈)을 앱과 같은 클래스(블렌드 모드·겹침 순서)로 페이지 위에 올렸다. 원본 PNG 알파 합성과 비교한 PSNR은 plus-lighter·screen 모두 30dB 초과다(측정 36.5~41.6dB).
- 실제 재생: 첫 전환에서 두 영상이 보여 준 프레임을 기록했다. 차이는 1프레임 이하(측정 0)여야 한다.
- 오픈·BACK·HOME은 즉시 이동한다(v21). 결과 → 대기는 전환이 재생된다.
- 메인 스레드를 300ms 막아도 영상은 0.3초 진행한다.
- 스위치를 끄면 즉시 이동한다. 재생이 거부돼도 이동은 완료된다.

## 확인 필요

- iPad에서:
  - 전환 영상과 다음 화면 영상을 동시에 디코딩할 때의 부하
  - 첫 전환의 지연
