# daemon

DB를 만지는 유일한 프로세스. 호스트(OS·네트워크·git)를 만지는 코드는 전부 여기
안에만 있고, `core`는 그 밑을 모른다.

- `http/` — 표면. `app.ts`가 포트 하나를 열어 web(tRPC)과 CLI, 정적 SPA를 받고,
  `router.ts`가 화면이 부르는 프로시저를 모아 둔다
- `service/` — 요청을 `core`와 `host`에 잇는 얇은 층. 프로젝트 열기·설정·스펙
  노드
- `host/` — 호스트에 손대는 자리. `~/.shall`(설정·레지스트리·daemon 상태),
  프로젝트의 `.shall` 폴더, 폴더 탐색

`types.ts`는 daemon이 아는 것들 — 호스트 상태와 화면이 읽는 모양. 그래프 값은
`@shall/core/graph`에 있다.

방향은 `http → service → host·core` 한 쪽뿐이다. 되돌아 부르는 import가 생기면
그건 층이 잘못 잡힌 것이다.
