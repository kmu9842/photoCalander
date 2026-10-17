# Photo Calendar

사진과 자유 형식 메모를 날짜별로 기록하는 Windows 데스크톱 달력 위젯입니다.

## 다운로드 및 실행

[최신 배포본 다운로드](https://github.com/kmu9842/photoCalander/releases/latest)

`PhotoCalendar-1.0.0-Windows.exe` 하나만 다운로드하여 실행합니다. Windows x64용이며, 설치나 별도의 Node.js·DLL 파일이 필요하지 않습니다. 첫 실행에는 내부 파일을 푸는 시간이 걸릴 수 있습니다.

기본 배경은 흰색, 불투명도는 30%입니다. 창 상단을 드래그하여 이동하고 가장자리와 모서리로 크기를 조절합니다.

## 사용법

- 날짜를 한 번 클릭하여 메모를 편집합니다. 편집창 바깥을 클릭하면 닫힙니다.
- 메모는 여러 줄을 입력할 수 있습니다. 글자를 선택하고 취소선 버튼 또는 `Ctrl+Shift+X`를 누르면 취소선이 적용됩니다.
- 사진은 파일 선택, 드래그 앤 드롭, `Ctrl+V`, 붙여넣기 버튼으로 첨부합니다. 사진은 원본 비율로 표시합니다.
- 상단 팔레트 또는 설정에서 달력 전체 배경색을 바꿉니다. 날짜별 색상은 편집창 팔레트에서 따로 지정합니다.
- 설정에서 배경 불투명도, 글자 크기, 시작 요일, Windows 시작 시 실행을 변경합니다.
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

배포할 파일은 `release/PhotoCalendar-1.0.0-Windows.exe` 하나입니다. `win-unpacked`, 소스, 개발 의존성, 테스트 결과는 함께 배포할 필요가 없습니다.

DesktopCal의 날짜별 기록 방식을 참고한 독립 앱이며, DesktopCal 계정 연동이나 클라우드 동기화는 포함하지 않습니다.
