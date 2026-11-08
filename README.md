# CPPG 스터디 (PWA)

개인정보관리사(CPPG) 시험 준비용 정적 PWA. 개인정보 보호법 2026.9.11 시행본 기준.

- `/` 허브 · `/map` 법 관계도 · `/law` 조문 찾기 · `/quiz` 연습문제 · `/memo` 암기노트 · `/guide` 이용 가이드
- 오프라인 지원(서비스 워커), 홈 화면 설치 가능

## 배포
Vercel에 저장소를 Import 하면 추가 설정 없이 정적 사이트로 배포됨 (Framework Preset: Other, Build Command 없음, Output: 루트).

## 수정
`build.py`는 원본 3개 HTML(/home/claude/cppg)에서 페이지를 생성할 때 쓴 스크립트. 배포본은 이 저장소의 HTML을 직접 고쳐도 됨.

배포: https://cppgstudy.vercel.app
