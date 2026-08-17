# Shall 아키텍처

Shall은 AI 코딩 에이전트를 위한 로컬 spec-driven control plane이다. 사용자 컴퓨터에서
daemon 하나가 돌고, 사람은 localhost 웹 화면에서 스펙을 보고 고치며, 에이전트는
프로젝트 안의 `.shall/spec/` 폴더에 있는 마크다운 파일을 직접 읽고 쓴다. SaaS로
설계됐던 이전 버전의 기록은 [`LEGACY-ARCHITECTURE.md`](./LEGACY-ARCHITECTURE.md)에
있다 — 이 문서가 현재의 정본이다.

## 원칙

- **판정에 AI가 없다.** 충족·낡음·게이트·보드는 전부 세고, 비교하고, 시간을 보는
  산술이다. AI는 제안을 만들 뿐이며, 그 AI조차 이 프로그램 밖(접속한 에이전트)에 있다.
- **파일이 정본이다.** `.shall/spec/<band>/<Type>/<id>.md`의 마크다운은 그래프의 표현이
  아니라 그래프 **그 자체**다. 커밋되어 코드와 함께 여행하고, 이력·병합·리뷰는 git이
  한다 — Shall은 그 층을 다시 만들지 않는다. 백업도 이사도 clone이다.
- **`shall check`가 문지기다.** 에이전트는 중개자 없이 파일을 고치고, 컴파일러에게
  받듯 검사를 받는다. 통과하지 못한 파일은 문장 하나를 받고 그래프에서 빠지며, 나머지
  그래프는 그대로 읽힌다 — 한 파일의 오타가 200개짜리 스펙 전체를 멈춰 세우지 않는다.
- **계산 결과는 저장하지 않는다.** 충족률·보드 같은 값은 컬럼이 아니라 매번 그래프에서
  다시 계산한다.
- **같은 그래프는 같은 바이트.** frontmatter에 허용된 형태는 정칙형 **하나**뿐이다:
  키 순서 하나, 엣지 순서 하나, LF, BOM 없음, 말미 개행 하나. 본문은 쓴 그대로가
  정칙이다(가장자리 빈 줄만 정리). 정칙화는 **고정점**이라 `emit(parse(정칙 바이트))
  === 정칙 바이트`이고, 그래서 아무것도 바꾸지 않은 저장은 빈 diff를 내고, 같은 편집을
  한 두 사람은 충돌 없이 병합된다.
- **frontmatter는 기계의 것, 본문은 저자의 것.** 펜스 위에는 그래프가 필요로 하는
  세 가지 — `short_name`·`name`·`edges` — 와, WorkLog 하나만 나르는 `commits`(그
  작업이 만든 커밋의 sha 목록 — 메시지는 git의 것), 그리고 기계가 스스로 쓰는 블록
  하나 — 에이전트가 삭제를 청하는 `deletionProposed` — 만 산다. 펜스 아래는 스펙 그
  자체이고, 자유 마크다운이다: 어떤 헤딩이든, 어떤 형태든, 쓴 그대로 읽히고
  그려진다. 템플릿의 `## <라벨>` 헤딩들은 시작을 돕는 제안이지 규칙이 아니다.
- **spec/은 순수 저작물이다.** 노드 파일 안에는 자기 판정 상태에 대한 어떤 주장도
  없다. 판정은 파일 밖, 데몬만 쓰는 장부 세 권에 산다 — `.shall/ledger/approvals.yaml`
  (nodeId → `{approvedHash, by, at}`), `rejections.yaml`(nodeId → `{rejectedHash, by,
  at, rationale}` — 무언가를 "열어 둔" 기록은 같은 키 아래 맵을 하나 더 실어 노드
  반려와 구분한다: AC면 `evidence: {id → hash}`, task면 `workLogs: {id → hash}`),
  `acceptances.yaml`(acId → `{acHash, evidence: {id → hash}, by, at}` 또는 taskId →
  `{taskHash, workLogs: {id → hash}, by, at}`) — 각각 노드당 최신 레코드 하나. 승인과
  반려는 서로를 지우지 않지만, 닫힘의 두 말(closed / left open)은 주체마다 한 권에만
  산다 — 닫으면 rejections에서 지우고, 열어 두면 acceptances에서 지운다. 옛 `approval:` 블록이 파일에
  남아 있으면 낯선 키처럼 이름으로 거부된다.
- **판정의 제조자는 사람 하나다.** 노드의 색은 저장되지 않고 매번 계산된다 —
  red는 고칠 오류(missing·문법 위반·고아) 또는 **유효한 반려**(rejectedHash = 현재
  hash), yellow는 사람의 판정이 남은 상태(장부에 기록 없음·승인 후 변경), green은 둘
  다 끝난 상태다. **색 = spec이 말하는 것(현재 내용의 hash) × 장부가 기억하는 것의
  대조**이고, 서명도 키도 없다. 반려는 내용이 바뀌면 산술로 실효한다 — 에이전트가
  고치면 노드는 스스로 yellow로 돌아온다. AC는 색과 별개의 두 번째 축을 하나 더
  단다: 빨간 **Open** / 초록 **Closed** 배지 — AC의 hash와, 그 AC를 CLAIMS하는 증거
  **전부**의 id→hash 목록이 acceptance 기록과 그대로 일치하면 closed. 색은 목록에
  끼지 않는다: 미승인 증거도 목록에 있다. 실행 밴드도 같은 물음을 받는다 —
  기록도 에이전트가 쓰고 사람이 읽는다. 판정을 만드는 길은 웹의 버튼뿐이고, 그
  버튼은 장부에 레코드 하나를 적을 뿐 노드 파일은 한 바이트도 건드리지 않는다.
  장부는 에이전트가 쓰지 않기로 한 파일이다(deny 규칙 — 관례 방어).
- **번들도 저장하지 않는다.** 리뷰 큐가 보이는 번들(Spec approval · Work report ·
  AC closure)은 로드마다 그래프와 장부 세 권에서 다시 계산한 배치이지 테이블의 행이
  아니다 — 저장·손편집·`git checkout`이 큐를 움직이고, 아무에게도 알릴 것이 없다.
- **전체가 하나의 TypeScript 프로그램.** "쓰기 경로가 몇 개인가" 같은 질문에 코드
  전체를 훑어 답할 수 있어야 한다.

## 전체 그림

프로세스는 셋이고, 에이전트는 프로세스가 아니라 **파일 계약**이다.

- **daemon** — 호스트를 만지는 유일한 프로세스. 스펙 파일을 읽어 화면에 서빙하고,
  화면이 저장하면 정칙 바이트로 되쓰고, 사람이 판정하면(승인·반려·닫힘) 장부에 적는다.
- **web** — localhost 브라우저 화면. 사람이 보고 고치는 표면.
- **cli** — `shall` 명령. daemon을 띄우고 브라우저를 여는 얇은 클라이언트.
- **에이전트** — 프로젝트의 `.shall/spec/` 폴더를 직접 읽고 쓴다. daemon과 대화하지
  않는다 (MCP 없음).

**daemon은 스펙 파일을 쓰는 유일한 Shall 프로세스이지, 그 파일들의 유일한 writer가
아니다.** 에이전트도, 사람의 편집기도, `git checkout`도, `git merge`도 같은 파일에
쓴다 — git working tree와 똑같은 신뢰 모델이다. 그래서 daemon은 매 쿼리마다 폴더를
다시 걸어 파일마다 `stat`하고(캐시가 아끼는 것은 *움직이지 않은 파일의 파싱*이지 *파일이
거기 있었다는 사실*이 아니다), 쓸 때는 `<이름>.<pid>.tmp`에 쓴 뒤 rename으로 앉힌다 —
읽는 쪽은 언제나 어느 한 버전의 파일 전체를 본다. **손으로 고친 파일이 재시작 없이
보이는 것**이 이 배치의 요점이다.

## 경로가 정체성

사실마다 집이 하나다. 두 집이 있으면 언젠가 서로 다른 말을 하고, 그 순간 어느 쪽이
맞는지 아무도 모른다 — 병합 뒤에는 특히.

| 사실      | 그 하나의 집                                                        |
| --------- | ------------------------------------------------------------------- |
| 노드 타입 | 폴더 이름 — `.shall/spec/<band>/<Type>/`, canon 철자 그대로          |
| 노드 id   | 파일 이름 stem — `<id>.md`                                          |
| 엣지      | **출발** 노드 파일의 `edges:` 목록. 도착 쪽엔 안 적는다             |
| 시각      | 파일시스템의 `mtime`. 파일 안에 시간 필드가 없다                    |

`<band>`는 타입의 밴드를 소문자로 쓴 네 폴더 — `domain`·`intent`·`plan`·`execution`
— 이고, 위성 셋(Assumption·Question·Decision)은 캔버스가 그리는 자리 그대로
`intent`에 산다. 밴드는 타입에서 도출되므로 새 정보가 아니라 서랍이다: 노드가 수백
개가 되어도 `spec/` 바로 아래는 폴더 넷이다. 타입 폴더가 밴드 밖이나 다른 밴드에
있으면 옳은 자리를 이름한 문장으로 거부된다 — 옛 평평한 배치는 `git mv` 한 번
거리다.

그래서 frontmatter의 `id:`·`type:` 키는 **금지**이고, 있으면 문장으로 거부한다
("A spec file does not carry id — the filename is the id." / "…the folder is the
type."). 그 밖의 키도 마찬가지다 — frontmatter는 `short_name`·`name`·`edges`,
WorkLog에 한해 `commits`, 그리고 기계 블록 하나(`deletionProposed`)만 나르고, 다른
키는 본문으로 가라는 문장 하나로 거부된다(`commits`를 다른 타입에 쓰면 WorkLog의
키라는 문장으로, 옛 `approval:` 블록은 승인이 `.shall/ledger/approvals.yaml`로
갔다는 문장으로). 엣지가 출발 파일에만 있으니 노드 파일을 지우면 나가는 엣지가
함께 사라지고, 지울 것을 세는 장부가 따로 없다.

타입별 하위 폴더는 두 가지를 산다 — 폴더가 타입의 집이 되어 파일 안에서 타입이
사라지고, 노드가 수백 개가 되어도 한 폴더가 평평하게 부풀지 않는다. **id는 폴더를
가로질러 전역으로 유일**하다: 엣지가 bare id(`to: AC-0001`)를 참조하므로, 두 폴더에
같은 id가 있으면 그 참조는 답이 둘인 질문이 된다. 대소문자만 다른 두 이름도 같은
이유로 막는다 — macOS·Windows에서는 한 파일이고, 이 repo는 그런 기계로 여행한다.

## 스펙을 쓰는 법

에이전트가 노드 하나를 새로 쓸 때의 전부:

1. **만든다.** `shall add-spec-node --type Requirement` — 타입마다 명령이 있는 게
   아니라 이 하나가 전부다. 데몬이 다음 빈 id를 골라
   `.shall/spec/intent/Requirement/<id>.md`에 시작 파일을 써 주고, 출력의 첫 줄이
   그 절대 경로다. 손으로 만들어도 똑같이 읽힌다: 참조 템플릿 22개는
   `~/.shall/templates/`에 있고, 폴더가 타입·파일명이 id라는 규칙은 같다.
2. **채운다.** frontmatter는 `short_name`·`name`, 나가는 관계가 있으면 `edges:`,
   WorkLog라면 그 작업이 만든 커밋의 `commits:` 목록(sha만, 만든 순서) — 그리고
   그게 전부다. 펜스 아래 본문이 스펙이고, 자유 마크다운이다: 템플릿이 깔아 준
   `## <라벨>` 헤딩들은 시작 형태일 뿐이라 그대로 채워도, 고쳐 써도, 전부 지우고
   다른 형태로 써도 된다. 템플릿의 `#` 주석은 남겨도 지워도 된다. 손대지 않은
   템플릿을 그대로 두면 검사가 두 문장을 돌려준다 — `A short name is required.` ·
   `A name is required.`
3. **검사한다.** 폴더 어디에서든 `shall check` — 프로젝트 루트는 `git`처럼 위로
   걸어 올라가 찾는다. 세 목록이 나온다: 그래프가 받지 못한 파일(problem), 파일은
   전부 읽히는데 그래프가 성립하지 않는 구멍(gap — 답하는 파일이 없는 참조, 살아있는
   앵커가 없는 고아), 그리고 읽히지만 정칙이 아닌 파일(note). problem과 gap이 exit
   1을 만든다 — 저작 중인 스펙은 사슬이 Goal까지 닿을 때까지 실패하고, 그 압력이
   의도다.
4. **커밋한다.** 이력·병합·리뷰는 git이 한다. 데몬은 스스로 커밋하지 않는다 —
   사람이 터미널에서 하거나, 웹의 **Commit spec** 버튼(git 프로젝트에서 spec이나
   장부에 미커밋 변경이 있을 때 활성; `.shall/spec`과 `.shall/ledger` 범위의 부분
   커밋 하나)으로 한다. 장부 세 권도 이렇게 커밋되어 repo와 함께 여행한다. 승인본
   diff와 삭제 복원은 git에 커밋된 만큼만 가능하다.

노드를 **없애는** 길도 파일 계약이다: 에이전트는 파일을 지우지 않고, frontmatter에
`deletionProposed:` 블록(`by`·`rationale` 두 키)을 적는다. 그 블록은 승인 hash의
페이로드 안에 있으므로 적는 것만으로 노드가 yellow가 되고, 사람이 패널에서 삭제를
승인하거나 반려한다. 승인된 삭제는 **그 노드의 파일 하나만** 지운다 — 이웃 파일의
가리키던 줄은 한 바이트도 건드리지 않고 남는다. 그 줄은 삭제의 역사이자 재앵커의
단서이고, 대상을 복원하면 스스로 다시 붙는다. `rm`으로 지운 파일은 경로가 아니라
사고다: 참조가 남아 있는 한 missing(red)으로 계산되고, git 이력에서 제자리로
복원된다.

**읽기는 관대하고 쓰기는 정칙이다.** 주석, 다른 인용 스타일, 다른 키 순서, 정렬되지
않은 `edges`, CRLF, BOM, 말미 개행 누락 — 전부 그대로 읽힌다. 대신 **UI에서 그
노드를 저장하는 순간 frontmatter는 정칙 바이트로 다시 쓰이고, 주석과 직접 정한
순서는 그때 사라진다** (본문은 쓴 그대로 남는다). `shall check`가 그런 파일들을
미리 *노트*로 알려주는 이유가 이것이다 — 예상하지 못한 diff로 알게 되는 일이 없도록.

거부는 파일 단위다. 문제가 있는 파일은 그 노드와 그 엣지가 통째로 빠지고, 파일 이름과
문장 하나가 함께 서빙된다. 나머지 그래프는 계속 읽히고 계속 그려진다.

## 모듈

### core/graph — 그래프 스키마

스펙 그래프의 문법을 정의한다.

- 노드·엣지 타입 정의 — 타입은 canon의 22개, 노드의 내용은 자유 마크다운 본문 하나.
  옛 Commit 타입은 사라졌다: 작업이 만든 커밋은 WorkLog frontmatter의 `commits:`
  목록(sha만 — 메시지는 git이 답한다)이지 노드가 아니다 — 한 줄의 사실에 파일 하나는
  과했다
- 22개 타입의 네 밴드 배치: 도메인(Domain) · 의도(Intent) · 설계(Plan) ·
  실행(Execution). 층이 없는 위성 셋은 매달린 노드를 따르되, 캔버스에 자리가 있도록
  Intent 밴드에 그린다
- 앵커 테이블 — 타입마다 노드를 그래프에 붙드는 관계(방향 포함). 뿌리 넷(Term·
  DomainEntity·Goal·Journal)만 앵커가 없고, 실행 밴드의 나머지는 그것을 제출·기록한
  WorkLog에 붙든다. 아래층이 겨냥 대상을 **자기 파일에 쓰는** 관계 셋이 있다 —
  ImplementationTask의 `TARGETS`(닫으려는 AcceptanceCriterion), WorkLog의
  `ADDRESSES`(다루는 과제), Evidence의 `CLAIMS`(만족시킨다는 기준) — 그래서 IT는
  ALLOCATES하는 모듈에 또는 자기 TARGETS 대상에, WorkLog는 LOGS하는 Journal에 또는
  자기 ADDRESSES 대상에, Evidence는 SUBMITS하는 WorkLog에 또는 자기 CLAIMS 대상에
  붙든다(#22·#23·#24는 2026-08-16에 방향을 뒤집었다: 겨냥하는 쪽이 겨냥 대상을
  말하므로, 과제를 세우거나 작업을 시작하거나 주장을 적어도 기준·과제 파일은 한
  바이트도 움직이지 않는다). 문법 테이블과 교차검증된다
- **겨냥 규칙(aim rule)** — 과제를 ADDRESSES하는 WorkLog가 SUBMITS하는 Evidence는
  그 과제가 TARGETS하는 기준만 CLAIMS해야 한다(claim이 없어도, 다른 기준을 claim해도
  위반). 파일 셋을 한꺼번에 읽는 유일한 문법이고, 판정이 아니라 **문법**이라 색 사슬의
  red(`off-target`)로 답한다 — 사람의 승인 이전에 지켜야 하는 것. 위반은 WorkLog와
  Evidence **양쪽**을 red로 만들고 관련 id를 전부 이름한 문장 하나를 단다(고칠 줄이
  세 파일 중 어디에 있어도 같은 문장을 읽도록). 과제를 ADDRESSES하지 않는 WorkLog는
  이 규칙 밖이다
- 판정 규칙 — id 형태, 두 이름, 본문의 문자·크기. 순수 함수 하나로 모아 두어
  파일 로더와 daemon의 door가 **같은 것**을 부른다. 문장도 발견 순서도 하나뿐이다
- 섹션 가이드 — 타입마다 템플릿이 제안하는 `## <라벨>` 시작 형태. 데이터일 뿐,
  아무것도 강제하지 않는다
- 이력은 여기 없다. 노드의 개정은 그 파일의 커밋이고, 무엇이 언제 바뀌었는지는
  git이 쥔다 — 리비전 테이블도, 파일에 새기는 버전 필드도 없다

### core/store — 저장

프로젝트별 `.shall/spec/` 폴더가 정본이고, 그 옆에 장부 세 권이 있다.
core에서 파일시스템을 만지는 유일한 모듈이고, 노드가 어느 경로에 사는지 아는 유일한
모듈이다.

- 로더 — 폴더 하나를 걸어 노드·엣지, 그리고 **거부한 파일마다 문장 하나**를 돌려준다.
  읽기가 통째로 실패하는 일은 없다
- 매 쿼리 re-stat + (mtime, size) 캐시 — 캐시는 파싱만 아낀다. 밖에서 고친 파일이
  재시작 없이 반영되지 않으면 이 전환의 이유가 사라진다
- 문제가 있는 파일은 통째로 빠진다(노드와 그 엣지 같이). **대상이 없는 엣지는 쓴
  그대로 남는다** — 삭제의 역사이자 재앵커의 단서라 로더가 버리지 않고, 그 구멍은
  검사와 리뷰가 이름한다. 삭제는 그 노드의 파일 하나만 지우고 이웃은 만지지 않는다
- 쓰기는 spec 폴더별 **직렬 큐**를 지나고, `<이름>.<pid>.tmp` + rename으로 앉는다.
  읽기는 큐를 타지 않는다
- **장부 세 권, 문 하나** — `.shall/ledger/{approvals,rejections,acceptances}.yaml`은
  같은 문(`ledger-door.ts`의 `readLedger`·`updateLedger`)을 지나고, 각 권은 자기
  이름의 얇은 문(`readApprovalLedger`·`recordApproval`·`recordApprovals` /
  `readRejectionLedger`·`recordRejection`·`withdrawRejection` /
  `readAcceptanceLedger`·`recordAcceptance`)으로 부른다. 읽기는 값으로 답한다(부재 =
  빈 장부, 못 읽으면 문장 하나·레코드 없음 — 리뷰는 그것을 거부로, `shall check`는
  problem 행으로 만든다). 쓰기는 파일 경로 키의 큐 턴에서 읽고-바꾸고-자기 바이트를
  되읽어 **텍스트 고정점**(`emit(parse(text)) === text`)을 확인하고-rename으로
  앉히며, **못 읽는 장부 위에는 쓰지 않는다**. 고정점 검사라 키를 지우는 철회도 같은
  검사를 지나고, 마지막 키를 지우면 0바이트 파일이 된다(빈 장부와 부재는 같은
  답). 옛 승인 문이 읽기·서명·쓰기를 한 큐 턴에 묶었던 것은 파일에 썼기 때문이고,
  파일을 안 쓰는 지금 그 성질은 사라졌다 — 데몬은 방금 로드한 그래프를 해시하고
  장부만 쓰며, 사이에 저장이 끼면 결과는 yellow(changed)이지 결코 거짓 green이
  아니다(레코드는 순간이 아니라 내용을 가리킨다)
- 쓰기 직전에 자기가 낼 바이트를 로더로 되읽는다 — 되읽을 수 없는 파일은 쓰지 않고,
  그래서 같은 규칙에 대한 문장이 두 벌 있지 않다
- 지금 파싱되지 않는 파일 위에는 쓰지 않고 거부한다. 누군가의 반쯤 된 편집이나 병합의
  잔해를, 되돌릴 것 없이 덮어버리지 않기 위해서다

### core/arith — 판정 산술

그래프에서 값을 계산하는 곳. AI가 닿을 수 없고, 닿을 AI도 없다. 입주자는 셋 —
**색 사슬**, **닫힘**, **번들**.

- 색 — 위에서부터 첫 일치: missing(파일 부재∧참조 잔존) → 문법 위반 → 고아(살아있는
  앵커 0) → **겨냥 규칙 위반**(off-target) → **반려 유효**(rejectedHash = 현재 페이로드
  hash) → 장부에 기록 없음 → approvedHash ≠ 현재 hash → green. 일곱 판정이 각각 순수
  술어 함수(`isMissing`·`hasSchemaViolation`·`isOrphan`·`isOffTarget`·`isRejected`·
  `hasApproval`·`isHashMatched`)이고,
  조합 함수는 우선순위만 쥔다 — 조건이 자라면 술어가, 순서가 바뀌면 조합이 바뀐다.
  반려가 승인보다 앞에 서 있어 둘 다 있으면 반려가 이긴다. canon의 모든 타입이
  색을 받는다. 색 밖에 남는 것은 삭제뿐이다: 기록은 지운다고 없던 일이 되지 않는다
- 장부 세 권의 레코드와 sha256 함수는 `Ledgers`(approvals·rejections·acceptances·
  hash) 한 묶음으로 주입받는다 — 해시는 daemon의 것이고 core는 브라우저에서도 돈다.
  `contentHashOf`가 승인·반려·닫힘의 문과 술어가 같은 것을 해시하게 하는 한 함수다.
  삭제 제안은 페이로드 안에 있어 전용 분기가 없다: 적으면 changed, 벗기면 도로
  green. spec에 없는 id의 레코드는 무시된다 — 삭제된 노드의 이력이고, 복원되면
  내용이 맞는 한 그대로다
- **닫힘의 주체는 둘이다**(`core/graph/closure-kinds.ts`) — AC는 그것을 CLAIMS하는
  Evidence로, ImplementationTask는 그것을 ADDRESSES하는 WorkLog로 닫힌다. 어떤 타입이
  어떤 관계로 닫히는지는 `ANCHOR_RULES`와 같은 성격의 canon 사실이라 core/graph의 표
  한 곳에 있고, 산술은 주체에서 그 표를 읽는다 — 두 주체가 두 코드 경로가 아니라
  목록만 다른 하나다. 레코드는 자기가 무엇을 닫았는지(kind)를 함께 들고, 종류가
  다른 레코드는 hash가 맞아도 서지 않는다
- 닫힘(`closure.ts`) — 주체의 open/closed와, 큐가 물어야 하는지. 판정은 **목록**에
  대한 것이다: 그 주체를 claim하는 살아있는 노드 전부의 id→hash. acceptance 기록이 있고
  **AC의 hash가 그대로**이고 **기록된 목록이 지금 목록과 같으면**(같은 id, 같은 hash,
  더도 덜도 없이) closed; rejections에 `evidence` 목록을 실은 기록이 같은 두 조건으로
  서면 "left open"(마크는 open, 사유가 함께); 둘 다 아니면 아무도 이 목록에 대해 말한
  적이 없는 것 — `closureAsks`가 참이고 큐가 묻는다. 증거가 추가·철회·수정되거나 AC가
  고쳐지면 어느 기록이든 산술로 실효한다. 색은 등록의 축, 마크는 충족의 축 — 서로 다른
  답을 낼 수 있고 그래야 한다(green+open = 확정됐고 증거 대기; yellow+closed도 가능).
  둘이 만나는 곳은 하나뿐: AC의 **문구 자체**가 반려 중이면 닫힘을 묻지도, 쓰지도 않는다
- 번들(`bundles.ts`) — 리뷰 큐. 먼저 Work report: Journal마다 나가는 엣지로 실행 층
  (과 거기 매달린 위성)만 걸어 서브트리를 묶고(위성의 out-앵커는 스펙 쪽과 같은
  규칙으로 뒤집어 읽는다), Journal이 닿지 않는 실행 yellow는 각자 뿌리. 다음 Spec approval: 순위표(Goal → Actor → UseCase → Scenario → SR →
  Requirement → AC → Constraint → 설계 타입 → 실행 → 도메인, 위성은 가장 깊은 부착
  노드의 순위 뒤)로 훑어 아직 어느 번들에도 안 든 yellow를 만나면 뿌리로 삼고, Intent·
  Plan 층 안의 나가는 엣지(out-앵커 — Decision의 AFFECTS/RESOLVES, Evidence의 CLAIMS
  — 는 부모를 가리키므로 뒤집어)로 닿는 서브그래프의 yellow∪반려를 멤버로, green을
  '무수정 확인' 목록으로 담는다. 뿌리 선택만 covered를 보고 도달은 안 본다 — 두
  뿌리가 닿는 노드는 두 번들에 다 실리고 `sharedWith`로 서로를 가리킨다. Term·DE는
  마지막에 각자 단일 번들. 마지막으로 AC closure: 증거가 하나라도 CLAIMS하고 **그
  증거가 전부 green**인데 지금 목록에 대해 closed도 left open도 말해진 적 없는 AC(문구가
  반려 중인 AC는 제외; 미승인 증거가 하나라도 있으면 그냥 open, 큐 밖).
  정렬은 AC closure → Spec approval → Work report, 그 안에서 멤버
  mtime 최솟값이 오래된 것 먼저. 뿌리는 yellow만이다 — 반려된 노드는 yellow 뿌리가
  닿을 때 멤버로 남고, 홀로 남으면 큐를 떠난다(에이전트 차례)
- reviewGraph — 상태 목록(각 상태에 approval·rejection 레코드, AC의 closure와 left-open
  기록, 겨냥 규칙이 쓴 문장 `problem`을 실어),
  답하는 파일이 없는 id와 그것을 이름하는 참조들, 읽히지 않는 파일들을 한 번에
  조립한다. `spec.review`와 `shall check`의 gap이 같은 산술을 읽는다
- 아직 안 온 것 — 낡음·게이트·보드·vitals. 색과 같은 방식으로, 저장 없이 계산될
  것이다

### core/serialize — 파일 형식

그래프와 바이트 사이. 순수 함수만 있다 — 파일시스템도, 시계도, 난수도 없다.

- **동결된 형식** — frontmatter 블록(`short_name`·`name`·`edges`, WorkLog에만
  `commits`, 그리고 기계 블록 `deletionProposed`) + 자유 마크다운 본문. UTF-8, BOM
  없음, LF, 말미 개행 하나. 키 순서·엣지 순서가 각각 하나뿐이고, 본문은 저자의
  바이트 그대로다
- **승인 페이로드** — `<type>/<id>` 한 줄 + 정칙 파일 전체. 경로 정체성이 앞에 붙어
  승인된 파일을 다른 id로 복사해도 레코드가 따라가지 않고, 해시가 정칙 emit
  기준이므로 되읽어 같은 노드가 되는 재포맷은 승인을 살려 둔다. 파일 안에 승인은
  없으니 뺄 블록도 없다
- **장부 형식 세 권** — `.shall/ledger/approvals.yaml`(nodeId → `{approvedHash, by,
  at}`), `rejections.yaml`(nodeId → `{rejectedHash, by, at, rationale}` — rationale은
  여러 줄일 수 있고 `\n` 이스케이프의 따옴표 스칼라로 앉는다), `acceptances.yaml`
  (acId → `{acHash, evidence: {evId → hash, …}, by, at}` — evidence는 항목 하나
  이상의 중첩 맵). 셋 다 id 바이트 순, 키와 값 전부 같은 스칼라 규칙, 같은 yaml
  계약(`yaml.ts` 한 곳)으로 읽고, 루트 읽기(BOM/CRLF → YAML → 맵 → 맨몸/따옴표
  쌍둥이 키 → id 판정)는 `ledger-common.ts` 한 곳을 지난다. 산문이 없는 순수
  레코드라 md가 아니라 YAML이다. 관대하게 읽고 정칙으로 쓰며, 안 읽히면 파일 전체에
  문장 하나
- emit — 노드 하나를 자기 파일의 바이트로. 스칼라를 맨몸으로 낼지 따옴표로 감쌀지는
  직접 판정한다(YAML 1.1∪1.2에서 불리언·숫자·타임스탬프로 읽힐 수 있는 값은 전부
  따옴표). 라이브러리의 stringify에 맡기면 파일 형식이 그 버전에 묶인다. 본문 위에서
  emit은 항등이다
- parse — 되읽기. 관대하게 읽고 정칙으로 쓴다: 애매하거나 틀린 것만 거부하고(두 집을
  가진 사실, 텍스트가 아닌 이름, frontmatter가 나르지 않는 키), 던지지 않고 문장을
  모은다. 본문에는 아무 의견이 없다. `yaml` 패키지는 `yaml.ts` 한 곳에서만
  불리고(frontmatter와 장부 세 권이 같은 계약을 import한다) 버전이 **정확히**
  고정돼 있다 — 무엇을 받아들이는지가 곧 계약이므로
- 템플릿 — 타입 하나의 시작 파일을 canon에서 만든다. 두 얼굴이 있다:
  `emitTemplate`은 `~/.shall/templates/`의 참조 사본, `emitScaffold`는
  `add-spec-node`가 노드 자리에 실제로 써 주는 파일(경로·id 안내가 빠진 같은 몸).
  순수 함수라 재생성이 바이트-멱등이다
- 고정점 — `emit(parse(정칙 바이트)) === 정칙 바이트`, 그리고 유효한 파싱 결과의
  emit은 언제나 정칙이다

### core/exchange — 비어 있는 자리

세션 개설·base 내보내기·draft 제출·rebase·착지 기계가 들어갈 자리였다. 들어가지
않았다 — git이 이미 그 일을 하고, 에이전트는 `.shall/spec/`을 직접 고치며,
`shall check`가 문지기다. 중개가 필요하다는 것이 증명되면 그때 이 자리로 돌아온다.
그때까지 이 모듈은 `export {}` 하나다.

### daemon — 서버

단일 프로세스. 호스트(OS·네트워크·git)를 만지는 코드는 전부 여기에만 있다. 스펙
파일을 쓰는 Shall 프로세스는 이것 하나이지만, 그 파일들의 유일한 writer는 아니다.

- HTTP 하나로 web 화면(tRPC)과 CLI, 정적 SPA를 받는다
- 스펙 프로시저 — 노드·엣지 읽기와 쓰기 다섯, 리뷰 표면 일곱(`review`·`approve`·
  `rejectDeletion`·`approvedVersion`·`restoreNode`·`gitStatus`·`commitSpec`), 그리고
  리뷰 큐의 여섯(`reviewQueue`·`reject`·`withdrawRejection`·`approveNodes`·
  `acceptClosure`·`leaveOpen`), 그리고 보드의 하나(`taskBoard`). 문장과 순서가 door의 것이고, 거부 종류(`invalid`·
  `conflict`·`missing`)가 여기서 상태 코드를 얻는다. `approve`·`approveNodes`가 green의,
  `reject`가 반려 red의, `acceptClosure`가 closed의, `leaveOpen`이 left-open의 유일한
  제조 경로다 — 각각 장부에 레코드를 쓰고 노드 파일은 건드리지 않는다.
  `approveNodes`는 전부-아니면-무다: 가드를 전부 지난 뒤 한 번 쓰고, 하나라도 막히면
  막힌 것을 전부 나열하며 아무것도 안 쓴다. `acceptClosure`는 id 하나를 받아 **지금 그
  주체를 claim하는 것 전부**로 닫고(AC면 CLAIMS하는 증거, task면 ADDRESSES하는 작업
  기록), `leaveOpen`은 같은 목록에 사유를 붙여 열어 둔다; `taskBoard`는 아무것도 쓰지
  않는 읽기 하나다 — 보드의 모든 열이 장부에서 세어지므로 장부가 안 읽히면 통째로
  거부한다;
  둘 다 상대 장부의 기록을 먼저 지우고 쓴다(사이에서 실패하면 아무 말도 없는 상태 =
  큐가 다시 묻는 안전한 쪽). 증거가 하나도 없거나, 증거 중 green이 아닌 것이 있거나(그
  id를 이름해 거부), AC의 문구가 반려 중이면 둘 다 거부.
  에이전트의 계약은 파일 전용이라 이 문을 두드릴 이유가 없고, 장부는 deny 규칙이
  가린다(관례 방어 — 로컬 토큰은 daemon이 신뢰하지 않는 호출자가 생기는 날의 일).
  세 권 중 하나라도 안 읽히면 리뷰·큐·판정은 어느 권인지 이름한 문장 하나로 거부한다
  — 전부-yellow는 색을 입은 거짓말이다. sha256은 host의 `payloadHash` 하나다
- `spec.check`·`spec.scaffold` — 프로젝트 id가 아니라 **경로**를 받는 두 프로시저.
  레지스트리는 이 기계에서 누군가 UI로 연 폴더의 목록이고, 갓 clone한 checkout은 그
  목록에 없다. 한 번 열어야만 쓸 수 있는 스펙은 그것을 나르는 repo보다 덜
  이동적이다. `scaffold`는 타입을 대소문자 무시로 해석해 다음 빈 id로 시작 파일을
  쓰고 그 경로를 답한다
- 기동할 때와 프로젝트를 열 때 `~/.shall/templates`의 참조 템플릿 22개를 바이트
  비교해 다른 것만 다시 쓰고(canon에서 빠진 타입의 템플릿은 지운다), `spec/` 폴더가 있는지 보장하고, 옛 Shall이 프로젝트에
  남긴 `.shall/templates`는 지우고, `.claude/settings.json`에
  `Read(~/.shall/**)`·`Edit(/.shall/ledger/**)` 두 deny 규칙을 병합해 둔다(없는
  규칙만 뒤에 붙이고, 파싱 안 되는 파일은 바이트 그대로 두는, 조용한 관례 방어)
- **훅을 설치하지 않고, 스스로 커밋하지 않는다.** 스펙의 이력은 사람이 만든다 —
  터미널에서, 또는 웹의 Commit spec 버튼으로(그때도 커밋은 spec 폴더와 장부 범위의
  부분 커밋 하나이고, 변경이 있는 경로만 pathspec에 든다). 브랜치 표시는 여전히
  `.git/HEAD`를 직접 읽어 바이너리를 띄우지 않지만, **상태를 다루는 일곱**(status·
  add·commit·log·show·rev-list·init)은 `git-cli` 한 문 뒤에서 바이너리를 띄운다 —
  승인본 재구성, 삭제 복원, 커밋 버튼, 프로젝트 생성 시 `git init`이 그 소비자다
- **장부는 repo와 함께 여행한다.** clone한 기계도 같은 green을 읽는다 — 머신 키가
  없으니 잃을 키도 없고, 사람이 다시 승인해야 하는 순간은 내용이 바뀌었을 때뿐이다
- 정적 SPA 서빙, 프로젝트 레지스트리(`~/.shall/`), 설정 파일 관리

### apps/web — 화면

localhost 브라우저 화면. 사람의 관찰·편집 표면.

- Control plane — review queue · task board · activity · vitals. 전부 core/arith
  계산 결과의 표시. **Task Board**도 채워졌다: 위가 Fix Spec(모든 red — 사람의 반려가
  먼저, rationale은 **전문**; 그다음 문법 red, 구멍, 안 읽히는 파일), 아래가
  Implement(미완료 ∧ 선행 전부 닫힘 ∧ 상향 사슬 all-green인 task만 — 조건 미달은 이유
  없이 아예 안 보인다). 두 열 다 저장 없음. **Review Queue**가 채워졌다: 목록은 `[종류 배지] 제목 — 요약
  수치` 한 줄씩(AC closure → Spec approval → Work report, 오래된 것 먼저), 카드는
  전면에 판정 재료(뿌리의 diff/전문, Journal 본문, AC 본문)·멤버 목록(노드마다
  diff/전문, [Approve]·[Reject…]·[Open in Spec Plane])·접힌 무수정 확인 목록·번들 버튼
  하나 또는 둘([Approve all]/[Accept report]/[Close]+[Leave open…]). 번들은 네 종류다 —
  AC closure · Task closure(그 task를 ADDRESSES하는 WorkLog 목록, 겨냥한 AC들의 마크를
  문맥으로) · Spec approval · Work report. 반려는 인라인
  팝오버 — 대상 id·이름, 필수 rationale, 확정/취소 — 이고 카드의 행 우클릭과 스펙
  플레인 카드 우클릭 어디서든 같은 팝오버다. 판정 직후 카드는 큐를 다시 계산하고,
  방금 내린 반려는 페이지의 '최근 판정' 줄에 [Undo]로 남는다. task board·activity·
  activity·vitals는 아직 예약석
- Spec plane — 그래프 캔버스(React Flow)와 노드 상세, 그리고 리뷰 표면. 카드마다
  신호등이 색을 달고, AC는 id 옆에 빨간 Open/초록 Closed 배지를, ImplementationTask는
  같은 자리에 Blocked/Ready/Done 배지를(회색 둘·윤곽선 초록 하나 — Ready 집합은 Task
  Board의 Implement 열과 같은 술어다) 하나 더 달며, 노드
  패널이 판정 재료와 버튼을 같은 화면에 둔다: 미승인은 전문이 곧 재료, 승인 후 변경은
  승인본 대비 라인 diff, 삭제 제안은 사유·영향과 승인/반려 두 버튼, 반려 중이면
  rationale과 [Withdraw rejection], 이전 반려가 있으면 그 rationale 한 줄, green은
  장부에서 읽은 "Approved by … · …" 한 줄과 [Reject…]; AC에는 닫힘 토글 — CLAIMS하는
  증거가 하나라도 있고 전부 green이어야 켜지고(미승인 증거는 id를 이름해 기다린다),
  켜면 지금 목록으로 닫고, 끄면 사유를 받아 열어 둔다(left open 상태면 그 사유가
  보인다). missing·broken은 툴바의 problems
  다이얼로그에서 복원한다. `?node=<id>&back=<경로>`로 열리면 그 노드로 열리고 툴바에
  Back to review가 선다 — 리뷰 큐가 이 플레인으로 보내고 되돌려 받는 길이다. 저장은
  그 노드의 파일을 정칙 바이트로 다시 쓰고, 판정은 파일이 아니라 장부를 쓴다
- Settings — 설정 파일을 그대로 보여주고 고치는 화면

### client/cli — 명령줄

`shall` 명령. 계산도 직렬화도 하지 않는 얇은 클라이언트.

- daemon 기동·재사용, 브라우저 열기
- `shall init` — 이 폴더를 프로젝트로 (`projects.create` 위의 얇은 층)
- `shall check` — `파일 — 문장`을 출력하고 problem이나 gap이 있으면 exit 1.
  승인 여부(yellow·green)는 말하지 않는다 — 그건 리뷰의 것이다. 장부 세 권 중 안
  읽히는 것마다 `.shall/ledger/<파일> — 문장` 한 행이 problem이고, 두 권이 상하면 두
  행이 선다. `shall approve`·`shall reject`·`shall close`는 영원히 없다: 판정의
  제조자는 브라우저의 사람뿐이다
- `shall add-spec-node --type <Type>` — 시작 파일 하나를 제자리에 만들고 첫 줄로
  그 절대 경로를 출력한다. 타입은 인자라서 canon이 자라도 명령은 하나다

## 레거시에서 사라진 것

MCP 서버 · webhook 수신 · 외부 cron · 추론 클라이언트와 그 게이트 · 등급/계량 ·
멀티테넌트 격리 · 독립 Verifier (증언 리포트의 노드 타입만 스키마에 예약해 둔다).

이번 전환으로 둘이 더 빠졌다 — **SQLite 저장소**(정본이 커밋되는 마크다운으로
옮겨갔다)와 **세션/base/draft/제출 기계**(git이 그 일을 한다). 옛 `shall.db`는
마이그레이션 없이 버려지고, `.gitignore`에는 남아 계속 무시된다.

## 얼어붙은 것

아래는 이제 사용자 repo에 바이트로 남는다. 바꾸면 그들의 git 히스토리를 다시 쓰게
하므로, 바꾸지 않는다.

- **파일 형식** — frontmatter 키의 순서(`short_name`·`name`·`edges`, WorkLog에만
  `commits`, 그리고 `deletionProposed`), 스칼라의 맨몸/따옴표 판정, 본문은 자유
  마크다운 그대로, LF·BOM 없음·말미 개행 하나. `approval` 블록은 2026-08-16에
  **의도적으로 뺐다** — 외부 사용자가 생기기 전의 개정이고, 승인은 장부로 갔다.
  관대한 **읽기의 수용 범위**도 형식의 일부라 `yaml` 패키지 버전이 정확히 고정돼 있다
- **승인 페이로드** — `<type>/<id>` 한 줄 + 정칙 파일, sha256. 이 정의가 바뀌면
  장부의 모든 레코드가 yellow로 돌아간다
- **장부 세 권** — `.shall/ledger/approvals.yaml`(nodeId → `{approvedHash, by, at}`),
  `rejections.yaml`(nodeId → `{rejectedHash, by, at, rationale}`, 열어 둔 기록이면
  `evidence:` 또는 `workLogs:` 맵 하나를 더), `acceptances.yaml`(acId → `{acHash,
  evidence: {evId → hash}, by, at}` 또는 taskId → `{taskHash, workLogs: {wlId → hash},
  by, at}`), id 바이트 순, 파일 형식과 같은 스칼라 규칙과 yaml 계약. 뒤의 두 권은
  2026-08-16의 리뷰 큐 라운드에 얼었고, task 쪽 두 키는 2026-08-17에 나란히 얼었다 —
  criterion 레코드의 바이트는 그대로다
- **엣지 #22·#23·#24의 방향** — `ImplementationTask —TARGETS→ AcceptanceCriterion`,
  `WorkLog —ADDRESSES→ ImplementationTask`, `Evidence —CLAIMS→ AcceptanceCriterion`
  (2026-08-16에 옛 `IS_PLANNED_BY`·`IS_ADDRESSED_BY`·`IS_CLAIMED_BY`를 뒤집었다). 문법의
  다른 행은 얼지 않았지만, 이 세 행은 아래층 파일의 바이트에 남으므로 여기 적는다
- **경로가 정체성** — `.shall/spec/<band>/<Type>/<id>.md`. 밴드 폴더 넷, 폴더가
  타입, 파일명이 id, 엣지는 출발 파일에만, 시각은 `mtime`

아직 얼지 않은 것: CLI 서브커맨드의 이름과 출력, `spec.check` 응답의 모양,
리뷰 응답과 리뷰 큐 응답의 모양(장부의 by·at·rationale과 AC의 closure가 상태에
실리는 것, 번들의 필드들 — 전부 이 자유 안에서 한 일이다).
