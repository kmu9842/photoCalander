# Photo Calendar

사진과 자유 형식 메모를 날짜별로 기록하는 Windows 데스크톱 달력 위젯입니다.

## 다운로드 및 실행

[최신 배포본 다운로드](https://github.com/kmu9842/photoCalander/releases/latest)

`PhotoCalendar-1.1.0-Windows.exe` 하나만 다운로드하여 실행합니다. Windows x64용이며, 설치나 별도의 Node.js·DLL 파일이 필요하지 않습니다. 첫 실행에는 내부 파일을 푸는 시간이 걸릴 수 있습니다.

기본 배경은 흰색, 불투명도는 30%입니다. 창 상단을 드래그하여 이동하고 가장자리와 모서리로 크기를 조절합니다.

## 사용법

- 날짜를 한 번 클릭하여 메모를 편집합니다. 달력 너비를 유지한 채 창이 옆으로 늘어나 편집창이 열립니다. 편집창 바깥을 클릭하면 닫히고 원래 너비로 돌아옵니다.
- 메모는 여러 줄을 입력할 수 있습니다. 글자를 선택하고 취소선 버튼 또는 `Ctrl+Shift+X`를 누르면 취소선이 적용됩니다.
- 사진은 파일 선택, 드래그 앤 드롭, `Ctrl+V`, 붙여넣기 버튼으로 첨부합니다. 30MB 제한 없이 긴 변 최대 1,920px의 WebP와 560px 미리보기로 자동 저장합니다. 비율·투명도를 유지하고 원본 파일은 수정하지 않습니다. 움직이는 이미지는 첫 프레임을 사용합니다.
- 상단 팔레트 또는 설정에서 달력 전체 배경색을 바꿉니다. 날짜별 색상은 편집창 팔레트에서 따로 지정합니다.
- 설정에서 전체 글자 크기를 스피너로 8~48px 범위에서 1px씩 조절합니다(기본 13px). 날짜·요일·월 제목·메모·설정 메뉴가 함께 비례해서 바뀝니다. 배경 불투명도, 시작 요일, Windows 시작 시 실행도 변경할 수 있습니다.
- Windows에 설치된 글꼴을 선택하고 달력 선 두께를 0~6px로 조절할 수 있습니다.
- 공휴일은 Windows 국가/지역을 자동 감지하거나 국가를 직접 선택해 받습니다. [Nager.Date](https://date.nager.at)의 국가 공통 공휴일을 하루 단위로 갱신하며, 오프라인에서는 저장된 자료를 표시합니다. 주·도별 공휴일은 포함하지 않습니다.
- 설정의 엑셀 가져오기·내보내기에서 CalendarTask의 목록형(날짜/내용)과 달력형(월요일~일요일)을 지원합니다. 날짜·메모·취소선·글자색·날짜 배경색을 옮기며, 미리보기 후 기존 메모에 추가하거나 해당 날짜 메모만 교체할 수 있습니다. 사진은 기존 JSON 백업을 사용합니다.
- 달력형 파일의 숫자 `2026.1`처럼 1월/10월이 모호한 경우 실제 연월을 직접 선택합니다. 내보낼 때는 월을 텍스트로 저장해 이 문제를 방지합니다.
- 핀 버튼으로 바탕화면 고정을 전환합니다. X는 트레이로 숨기며, 트레이 메뉴 또는 설정에서 종료합니다.

기록과 사진은 `%APPDATA%\PhotoCalendar`에 저장됩니다. 설정에서 사진을 포함한 백업을 내보내거나 불러올 수 있습니다. 개인 기록과 사진은 저장소와 배포 파일에 포함하지 않습니다.

자세한 조작은 [사용법.txt](사용법.txt)를 참고하세요.

## 개발

Windows, Node.js 22.12 이상이 필요합니다.

```powershell
npm.cmd ci
npm.cmd run dev
```

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:desktop
npm.cmd run test:interactions
npm.cmd run test:layout
npm.cmd run test:rich-text
npm.cmd run test:background
```

Electron 통합 테스트는 Windows 데스크톱 세션에서 각각 실행합니다. 테스트는 임시 데이터 폴더를 사용합니다.

## 실행 파일 만들기

실행 중인 배포본을 종료한 뒤 다음 명령을 실행합니다.

```powershell
npm.cmd run package
node scripts/test-portable.mjs
```

배포할 파일은 `release/PhotoCalendar-1.1.0-Windows.exe` 하나입니다. `win-unpacked`, 소스, 개발 의존성, 테스트 결과는 함께 배포할 필요가 없습니다.

DesktopCal의 날짜별 기록 방식을 참고한 독립 앱이며, DesktopCal 계정 연동이나 클라우드 동기화는 포함하지 않습니다.
