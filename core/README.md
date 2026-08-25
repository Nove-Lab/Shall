# core

밑에 호스트가 없는 부분. 소켓도, git도, `process.argv`도 여기서는 못 만진다.
파일을 여는 건 `store` 하나뿐이고, 그것도 daemon이 건네준 경로만 연다.

다섯 모듈과, 서로를 부를 수 있는 방향. 위의 모듈은 아래를 부르지 않는다.

| 모듈        | 맡는 것                                              |
| ----------- | ---------------------------------------------------- |
| `graph`     | 스펙 그래프의 문법 — 노드·엣지 타입, 밴드, 판정 규칙 |
| `store`     | 프로젝트별 `.shall/spec/<Type>/*.md`와 승인 장부 — 파일이 정본 |
| `arith`     | 판정 산술 — 색·닫힘·상태·보드·큐·vitals              |
| `serialize` | 파일 형식 — 정칙 emit과 관대한 parse                 |
| `exchange`  | 비어 있는 자리 — 세션 중개는 git이 대신한다          |

`store`가 여는 파일이 곧 정본이다. 노드 하나가 파일 하나이고, 폴더 이름이 타입,
파일 이름이 id다 — 그래서 `serialize`가 내는 바이트가 무엇을 담고 무엇을 담지
않는지가 `store`의 폴더 배치와 한 몸이다.

`exchange`는 비워 두기로 한 자리다 — 세션의 이력·병합·리뷰는 git이 맡는다.
각 모듈이 무엇을 담는지는
[`../docs/Project_Structure_and_Architecture.md`](../docs/Project_Structure_and_Architecture.md)에 있다.
