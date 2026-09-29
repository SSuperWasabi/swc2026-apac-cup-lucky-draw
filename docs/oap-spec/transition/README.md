# 화면 전환 영상 — 앱 적용 명세

원본: OAP 최종 폴더 `(Footage)/@TRANS_ASIA/TRANS_ASIA_#####.png` (알파 PNG 시퀀스, 가로형, 30fps). AE 가로형 전환 컴포지션의 프레임 f = PNG 프레임 f+6이다.

## 자산

`app/assets/oap/transition/transition-stacked.mp4` — 768×2048, **61프레임 전부를 54fps로(1.13초, 1.8배속을 파일에 구움, v19)**, H.264 High 레벨 4.2(54fps 디코딩량이 4.1 한도를 넘음), 0.55MB. 1배속 원본은 `resource/oap/ae-work/render/transition/transition-stacked-1x.mp4`에 보관했다.

- iPad Safari는 H.264 알파를 지원하지 않는다. 그래서 위 절반(768×1024)에 색(검정 위 premultiplied), 아래 절반에 알파(회색조)를 쌓았다. 앱이 WebGL로 다시 합성한다.
- 세로 변환: 높이 1024에 맞춘 뒤 가운데를 잘랐다. 이전 세로 MP4는 색 변환으로 채도가 빠져 있었다. 이 파일은 AE 소스 색을 그대로 쓴다.
- 1~6번째 PNG는 버리고(`-start_number 6`), 끝에 투명 프레임 2장을 덧붙였다.

```
ffmpeg -framerate 54 -start_number 6 -i TRANS_ASIA_%05d.png -filter_complex "[0:v]format=rgba,tpad=stop=2:stop_mode=add:color=0x00000000,scale=-2:1024:flags=lanczos,crop=768:1024,format=rgba,split[c][a];[c]premultiply=inplace=1,format=gbrp[cc];[a]format=rgba,alphaextract,format=gbrp[aa];[cc][aa]vstack,format=yuv420p[v]" -map "[v]" -c:v libx264 -profile:v high -level:v 4.2 -preset slow -crf 14 -g 27 -keyint_min 27 -sc_threshold 0 -r 54 -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv -an -movflags +faststart transition-stacked.mp4
```

## 앱 동작 (`app/transition.js`, swc-apac-v11)

- 재생 속도는 원본의 1.8배다(v11, 사용자 결정). v18부터는 파일 자체가 1.8배속이라 playbackRate 1로 재생한다. v11~v17의 playbackRate 1.8 재생은 iPad에서 살짝 버퍼가 있었다. v18에서는 30fps로 줄이며 프레임을 솎아내(원본 1.8장당 1장) 1장·2장 건너뛰기가 섞여 뚝뚝 끊겼다. 그래서 v19는 원본 프레임을 하나도 버리지 않고 54fps로 재생한다. AE 01_Transition 컴포지션도 같은 PNG 시퀀스 하나라, AE에서 1.8배속으로 렌더해도 프레임 솎기·블렌딩·Pixel Motion 외의 선택지는 없다.
- 앱 시작 시 파일 전체를 메모리(Blob)에 올리고, 소리 없이 한 번 재생해 디코더를 깨운 뒤 첫 프레임에 멈춰 둔다. 매 전환이 끝나면 바로 0초로 되감아, 다음 전환은 탐색 없이 시작한다.
- 프레임 11~48(54fps 기준)에서 화면을 완전히 덮는다(알파 254 이상).
- 영상 시간 13/54초에 화면을 바꾼다(덮인 상태). 48/54초에 다음 화면의 등장 애니메이션을 시작한다(걷히는 중). 선택 화면 등장은 `afterReveal`로 이때까지 미룬다.
- 전환 중에는 캔버스(z-index 4000)가 입력을 막는다.
- 캔버스는 object-fit: cover처럼 화면을 채운다.
- 실패 대비:
  - WebGL이 없거나 전환이 이미 재생 중이면 즉시 이동한다.
  - 재생이 거부되면 바로 이동한다.
  - 4초 감시 타이머가 있어서, 영상이 멈춰도 이동은 반드시 끝난다.

| 이동 | 전환 |
| --- | --- |
| 대기 → 선택 (배너 탭) | 적용 |
| 선택 → 오픈 (NEXT) | 적용 안 함(v11, 사용자 결정). 바로 오픈 화면으로 간다. 선택 화면을 숨긴 설정의 대기 → 오픈은 전환 유지 |
| 오픈 → 선택 (BACK) | 적용. 추첨 확정 후 오픈 중에는 이동하지 않는다 |
| 선택 → 대기 (HOME) | 적용 |
| 결과(당첨 영상·카드·참가상) → 대기 (탭·자동 복귀) | 적용 |
| 오픈 → 결과 | 적용 안 함. 기존 흰 화면 + 특별 영상(시네마틱) 연출 유지 |
| 관리자·백그라운드 탭 | 적용 안 함 |

관리자 `현장 운영 > 화면 전환 영상` 스위치(`cfg.screenTransitions`, 기본 켬)로 끌 수 있다.

## 검증 (Chrome, `scripts/test-transition-browser.cjs`)

- 대기 → 선택:
  - 화면이 덮인 뒤(영상 t ≥ 11/54초, 완전히 덮이는 첫 프레임) 바뀐다.
  - 등장 애니메이션은 t ≥ 0.84초에 시작한다.
  - 전환 중에는 입력이 막히고, 끝나면 캔버스가 사라진다.
- WebGL 합성 프레임 30과 소스 색 절반의 PSNR이 28dB를 넘는다(측정값 약 40dB).
- 선택 → 오픈은 전환 없이 즉시 이동한다.
- BACK에서 61프레임·54fps 전환이 메모리(Blob)에서 재생된다. HOME에서도 전환이 재생되고, 재고와 로그는 그대로다.
- 스위치를 끄면 즉시 이동한다. 재생이 거부돼도 이동은 완료된다.

다른 브라우저 테스트들은 전환을 끄고 실행한다(메모리의 `cfg.screenTransitions=false`만 바꾸고 저장소는 그대로 둔다).

## 확인 필요

- iPad에서:
  - 전환 영상과 다음 화면 영상을 동시에 디코딩할 때의 부하
  - 첫 전환의 지연
