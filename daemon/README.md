# daemon

스펙 파일을 쓰는 유일한 Shall 프로세스 — 그러나 그 파일들의 유일한 writer는 아니다.
에이전트도, 사람의 편집기도, `git checkout`도 같은 `.shall/spec/` 폴더에 쓴다.
호스트(OS·네트워크·git)를 만지는 코드는 전부 여기 안에만 있고, `core`는 그 밑을
모른다.

- `http/` — 표면. `app.ts`가 포트 하나를 열어 web(tRPC)과 CLI, 정적 SPA를 받고,
  `router.ts`가 화면이 부르는 프로시저를 모아 둔다
- `service/` — 요청을 `core`와 `host`에 잇는 얇은 층. 프로젝트 열기·설정, 스펙
  노드와 엣지의 door, 그리고 폴더 하나를 통째로 읽는 `spec.check`
- `host/` — 호스트에 손대는 자리. `~/.shall`(설정·레지스트리·daemon 상태),
  프로젝트의 `.shall` 폴더(`project.json`·`.gitignore`·`spec/`·타입별 템플릿),
  프로젝트 루트를 위로 걸어 찾는 탐색, 폴더 탐색

`types.ts`는 daemon이 아는 것들 — 호스트 상태와 화면이 읽는 모양. 그래프 값은
`@shall/core/graph`에 있다.

방향은 `http → service → host·core` 한 쪽뿐이다. 되돌아 부르는 import가 생기면
그건 층이 잘못 잡힌 것이다.
