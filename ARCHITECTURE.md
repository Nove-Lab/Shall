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
  작업이 만든 커밋의 sha 목록 — 메시지는 git의 것), Finding 하나만 나르는
  `blocking`·`relatedNodes`, 그리고 기계가 스스로 쓰는 블록 하나 — 에이전트가
  삭제를 청하는 `deletionProposed` — 만 산다. 펜스 아래는 스펙 그
  자체이고, 자유 마크다운이다: 어떤 헤딩이든, 어떤 형태든, 쓴 그대로 읽히고
  그려진다. 템플릿의 `## <라벨>` 헤딩들은 시작을 돕는 제안이지 규칙이 아니다.
- **spec/은 순수 저작물이다.** 노드 파일 안에는 자기 판정 상태에 대한 어떤 주장도
  없다. 판정은 파일 밖, 데몬만 쓰는 장부 세 권에 산다 — `.shall/ledger/approvals.yaml`
  (nodeId → `{approvedHash, by, at}`), `rejections.yaml`(nodeId → `{rejectedHash, by,
  at, rationale}` — 무언가를 "열어 둔" 기록은 같은 키 아래 맵을 하나 더 실어 노드
  반려와 구분한다: AC면 `evidence: {id → hash}`, WorkItem이면 `reports: {id → hash}`),
  `acceptances.yaml`(acId → `{acHash, evidence: {id → hash}, by, at}` 또는 workItemId →
  `{taskHash, reports: {id → hash}, by, at}` — 두 키의 이름은 얼어 있어 타입이 개명된
  뒤에도 그대로다) — 각각 노드당 최신 레코드 하나. 승인과
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
  장부는 에이전트가 쓰지 않기로 한 파일이다(deny 규칙 — 관례 방어). 그 옆의
  feed(`ledger/feed/`)도 같은 deny 아래 있다 — 에이전트는 `shall log`로 데몬에게 한
  줄을 부탁할 뿐, 파일을 열지 않고 되읽지도 않는다.
- **번들도 저장하지 않는다.** 리뷰 큐가 보이는 번들(Spec approval · Work report ·
  Finding · AC closure · Completion)은 로드마다 그래프와 장부 세 권에서
  다시 계산한 배치이지
  테이블의 행이 아니다 — 저장·손편집·`git checkout`이 큐를 움직이고, 아무에게도 알릴
  것이 없다.
- **전체가 하나의 TypeScript 프로그램.** "쓰기 경로가 몇 개인가" 같은 질문에 코드
  전체를 훑어 답할 수 있어야 한다.

## 전체 그림

프로세스는 셋이고, 에이전트는 프로세스가 아니라 **파일 계약**이다.

- **daemon** — 호스트를 만지는 유일한 프로세스. 스펙 파일을 읽어 화면에 서빙하고,
  화면이 저장하면 정칙 바이트로 되쓰고, 사람이 판정하면(승인·반려·닫힘) 장부에 적는다.
- **web** — localhost 브라우저 화면. 사람이 보고 고치는 표면.
- **cli** — `shall` 명령. daemon을 띄우고 브라우저를 열며, 터미널에서 묻는 것
  (검사·상태·보드)도 스스로 답하지 않고 daemon에 물어 받아 적는 얇은 클라이언트.
  에이전트가 한 run의 끝에 남기는 feed의 한 줄(`shall log`)도 같은 길로 daemon에게
  부탁한다.
- **에이전트** — 프로젝트의 `.shall/spec/` 폴더를 직접 읽고 쓴다. daemon과 직접
  대화하지 않는다 (MCP 없음) — 묻는 것도, run의 끝에 한 줄 부탁하는 것도 `shall`
  명령을 거친다.

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
— 이고, 층이 없는 위성은 Assumption 하나뿐이라 캔버스가 그리는 자리 그대로
`intent`에 산다. Decision은 위성이 아니라 plan에 사는 타입이고, 그 서랍은
`.shall/spec/plan/Decision/`이다. 밴드는 타입에서 도출되므로 새 정보가 아니라
서랍이다: 노드가 수백 개가 되어도 `spec/` 바로 아래는 폴더 넷이다. 타입 폴더가
밴드 밖이나 다른 밴드에 있으면 옳은 자리를 이름한 문장으로 거부된다 — 옛 평평한
배치는 `git mv` 한 번 거리다.

그래서 frontmatter의 `id:`·`type:` 키는 **금지**이고, 있으면 문장으로 거부한다
("A spec file does not carry id — the filename is the id." / "…the folder is the
type."). 그 밖의 키도 마찬가지다 — frontmatter는 `short_name`·`name`·`edges`,
WorkLog에 한해 `commits`, Finding에 한해 `blocking`·`relatedNodes`, 그리고 기계 블록
하나(`deletionProposed`)만 나르고, 다른 키는 본문으로 가라는 문장 하나로
거부된다(`commits`를 다른 타입에 쓰면 WorkLog의
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
   그 절대 경로다. 손으로 만들어도 똑같이 읽힌다: 타입마다의 참조 템플릿이
   `~/.shall/templates/`에 있고, 폴더가 타입·파일명이 id라는 규칙은 같다.
2. **채운다.** frontmatter는 `short_name`·`name`, 나가는 관계가 있으면 `edges:`,
   WorkLog라면 그 작업이 만든 커밋의 `commits:` 목록(sha만, 만든 순서), Finding이라면
   작업을 멈춰 세웠을 때의 `blocking: true`와 관련 id 힌트 `relatedNodes:` — 그리고
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
   의도다. 방금 고친 자리만 다시 묻는다면 `--scope <path>`로 파일이나 폴더를
   이름하고, 도구가 읽을 답이 필요하면 `--json`이다. 검사는 스펙이 성립하는지를
   답하지 **사람이 무엇을 판정했는지**는 답하지 않는다 — 그건 `shall status`이고,
   무엇을 할 차례인지는 `shall board`다. 둘 다 읽기이고, 색을 만드는 길은 여전히
   브라우저의 버튼 하나뿐이다.
4. **커밋한다.** 이력·병합·리뷰는 git이 한다. 데몬은 스스로 커밋하지 않는다 —
   사람이 터미널에서 하거나, 웹의 **Commit spec** 버튼(git 프로젝트에서 spec이나
   장부에 미커밋 변경이 있을 때 활성; `.shall/spec`과 `.shall/ledger` 범위의 부분
   커밋 하나)으로 한다. 장부 세 권도 — 그 옆의 feed도 — 이렇게 커밋되어 repo와
   함께 여행한다. 승인본 diff와 삭제 복원은 git에 커밋된 만큼만 가능하다.

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

- 노드·엣지 타입 정의 — 타입은 canon의 21개, 노드의 내용은 자유 마크다운 본문 하나.
  옛 Commit 타입은 사라졌다: 작업이 만든 커밋은 WorkLog frontmatter의 `commits:`
  목록(sha만 — 메시지는 git이 답한다)이지 노드가 아니다 — 한 줄의 사실에 파일 하나는
  과했다
- 21개 타입의 네 밴드 배치: 도메인(Domain) · 의도(Intent) · 설계(Plan) ·
  실행(Execution). 층이 없는 위성은 Assumption 하나뿐이고, 매달린 노드를 따르되
  캔버스에 자리가 있도록 Intent 밴드에 그린다
- 앵커 테이블 — 타입마다 노드를 그래프에 붙드는 관계(방향 포함). 뿌리 다섯(Term·
  DomainEntity·Goal·Journal·Finding)만 앵커가 없다. 앞의 넷은 시작점이라 그렇고,
  Finding은 소속이 태생을 따르기 때문이다 — 회전 중의 발견은 그 WorkLog가 RECORDS
  하고, 사람이 회전 사이에 가져온 물음은 붙들 WorkLog가 없다. 그 자리에 부모를
  지어내는 것이 없는 것보다 나쁘다. 아래층이 겨냥 대상을 **자기 파일에 쓰는** 관계
  셋이 있다 —
  WorkItem의 `TARGETS`(닫으려는 AcceptanceCriterion, 0개부터 여럿까지), WorkLog의
  `ADDRESSES`(다루는 작업 항목), Evidence의 `CLAIMS`(만족시킨다는 기준) — 그래서
  WorkLog는 LOGS하는 Journal에 또는 자기 ADDRESSES 대상에 붙들고, **Evidence와
  CompletionReport는 자기 CLAIMS 대상에만** 붙든다 — claim이 곧 그것을 그것이게 하는
  것이라, claim 없는 둘은 SUBMITS가 있어도 고아(red)다(SUBMITS는 누가 가져왔는지를
  말할 뿐이다; 2026-08-17에 좁힘 — claim 없는 Evidence가 승인되는 구멍이 화면에
  나타났다). **WorkItem은 ALLOCATES하는 Module에만 붙든다** — 자기 TARGETS는
  2026-08-23부터 앵커가 아니다: 소속은 정의(모듈의 분해)이고, 모듈 없는 작업 항목은
  "아무도 말해 주지 않는 저장된 백로그"가 아니라 고아(red)여야 하기 때문이다(#22·#23·#24는
  2026-08-16에 방향을 뒤집었다: 겨냥하는 쪽이 겨냥 대상을 말하므로, 작업 항목을
  세우거나 작업을 시작하거나 주장을 적어도 기준·작업 항목 파일은 한 바이트도
  움직이지 않는다). **Decision은 자기 `AFFECTS`로만 붙든다** — canon에서
  결정을 가리키는 것이 아무것도 없고, 아무것도 개정시키지 않는 결정은 결정이 아니다.
  `AFFECTS`의 1..N이 거기서 나온다: '살아있는 AFFECTS가 최소 하나'는 앵커 있는 모든
  타입에 고아 규칙이 이미 묻는 것이라 카디널리티 전용 기계가 없어도 되고, 앵커가
  아닌 `RESOLVES`는 그래서 0개가 합법이다(2026-08-21). 문법 테이블과 교차검증된다
- **겨냥 규칙(aim rule)** — 절이 둘이다(2026-08-23까지는 셋이었다: "작업 항목은
  기준을 최대 하나만 TARGETS한다"가 첫 절이었고, WorkItem이 AC를 하나부터 여럿까지
  겨냥하는 것으로 재정의되면서 빠졌다 — 작업 항목의 완료는 기준이 아니라 그것을
  CLAIMS하는 CompletionReport를 사람이 닫아 정해지므로, 겨냥이 둘이어도 닫히지 않는
  것은 없다). WorkLog가 SUBMITS하는 Evidence는 그 WorkLog가 ADDRESSES하는 작업
  항목들이 TARGETS하는 기준(합집합)만 CLAIMS할 수 있고, SUBMITS하는
  **CompletionReport는 그 ADDRESSES 대상 작업 항목들 중 정확히 하나만** CLAIMS할 수
  있다(둘 이상 claim하면 제출자가 없어도 위반). 파일 셋을 한꺼번에 읽는 유일한
  문법이고, 판정이 아니라 **문법**이라 색 사슬의 red(`off-target`)로 답한다 — 사람의
  승인 이전에 지켜야 하는 것. 위반은 WorkLog와 claimant **양쪽**을 red로 만들고 관련
  id를 전부 이름한 문장 하나를 단다(고칠 줄이 세 파일 중 어디에 있어도 같은 문장을
  읽도록). **작업 항목을 ADDRESSES하지 않는 WorkLog는 빈 허용 집합 밑에 있다**: 로그
  자체는 무죄지만, 그 밑의 Evidence·CompletionReport가 무언가를 claim하는 순간 양쪽이 red다
  (예외였다가 2026-08-17에 닫힘 — aim 없는 로그의 evidence가 아무 기준이나 claim할
  수 있었다). 아무 WorkLog도 SUBMITS하지 않는 claimant만 소속 절 밖이다
- **차단-작업 규칙(blocked-address rule)** — WorkLog가 ADDRESSES하는 작업 항목이
  **blocked**(사슬 미독 ∨ 선행 미완)면 그 로그는 red(`premature`)다: 일은 차례가 온
  작업 항목 밑에서만 기록된다(demo1의 WL-0002 → blocked 작업 항목 재현에서 나옴,
  2026-08-17). 작업 항목이 ready/done이 되는 순간 스스로 풀린다. 다른 노드들의 판정
  (작업 항목의 상태)을 읽는 유일한 red라 `colorOf`의 아홉 번째 질문이 되지 못하고,
  `reviewGraph`가 기본 사슬이 red를 내지 않은 노드에만 얹는다(술어는
  `work-item-state.ts`의 `prematureAddressOf`). 문·보드·check가 모두 statuses를 읽으므로
  전부 같은 답을 본다. 승인 순서에 함의가 있다: 사슬을 먼저 승인하고, 로그는 그
  작업 항목의 차례가 온 다음에(두 물결)
- **순환 규칙(loop rule)** — 계획이 자기를 기다리면 그 위의 모든 노드가
  red(`cyclic`)다(`core/arith/plan-seams.ts`, 2026-08-19). 두 갈래다: 쓰인
  `DEPENDS_ON` 순환(작업 항목끼리·요구끼리 — 순환 위 작업 항목은 영원히 ready가 될 수 없다)과
  **파생 모듈 그래프**의 순환(A가 CONSUMES한 계약을 B가 EXPOSES하면 A→B; 모듈끼리를
  잇는 엣지는 canon에 없으므로 계약에서 유도한다). `CONFLICTS_WITH`는 순서가 아니라
  불일치이므로 대상이 아니고, `RELATES_TO`도 아니다. 그래프당 한 번의 강한 연결 요소
  계산이다 — 노드마다 걷지 않는다(colorContextOf가 read마다 부른다). 경로 스택 방식이
  아닌 이유: A→B→C→A에 A→C가 더 있으면 짧은 쪽을 먼저 닫고 B를 놓친다. 문장은 순환
  위 모든 파일 밑에 각자의 시점으로 실리고(끊을 줄이 어느 파일에 있어도 읽히도록),
  최단 복귀 경로만 읊는다. 계약(Interface)은 red가 되지 않는다 — 순환이 지나가는
  통로일 뿐 그 파일에 지울 줄이 없다
- 판정 규칙 — id 형태, 두 이름, 본문의 문자·크기. 순수 함수 하나로 모아 두어
  파일 로더와 daemon의 door가 **같은 것**을 부른다. 문장도 발견 순서도 하나뿐이다
- 섹션 가이드 — 타입마다 템플릿이 제안하는 `## <라벨>` 시작 형태. 데이터일 뿐,
  아무것도 강제하지 않는다. Module은 Responsibility·Technology·Structure·Contracts·
  Behavior·Decisions 여섯, WorkItem은 Scope·Definition of Done·Notes 셋, WorkLog는
  Approach·Narrative·Outcome — 힌트는 영어 한 줄이고 Technology와 Definition of Done의
  힌트는 실제 기술 이름을 예로 든다(2026-08-23)
- 이력은 여기 없다. 노드의 개정은 그 파일의 커밋이고, 무엇이 언제 바뀌었는지는
  git이 쥔다 — 리비전 테이블도, 파일에 새기는 버전 필드도 없다

### core/store — 저장

프로젝트별 `.shall/spec/` 폴더가 정본이고, 그 옆에 장부 세 권이 있다 — 그리고
`ledger/feed/`에 사람용 활동 feed(월별 YAML 리스트, append-only)가 있다: 장부가 아니며
어떤 계산도 읽지 않는다. core에서 파일시스템을 만지는 유일한 모듈이고, 노드가 어느
경로에 사는지 아는 유일한 모듈이다.

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
- **feed, 문 하나 더** — `.shall/ledger/feed/YYYY-MM.yaml`은 맵이 아니라 시퀀스라
  `ledger-door.ts`(맵 루트의 `LedgerCodec`, id로 되읽는 `readBack`)를 지나지 못하고
  자기 문(`activity-ledger.ts`의 `readActivity`·`appendActivity`)을 가진다. 세 권의
  예절은 그대로다 — 경로별 큐, `.tmp` + rename, 자기 바이트를 되읽는 텍스트 고정점,
  **못 읽는 달 위에는 쓰지 않음**, 부재 = 빈 달 — 그리고 동사는 append 하나뿐이다:
  달 파일을 읽고 레코드 하나를 뒤에 붙여 통째로 다시 앉힌다(파일 끝에 바이트를 덧대는
  쓰기는 이 store에서 유일하게 반쯤 남을 수 있는 쓰기라 그렇게 하지 않는다). 쓴
  레코드를 고치거나 지우는 문은 없다. 문을 일반화하지 않은 이유는 동결된 세 권의
  문에 둘째 컬렉션을 가르치는 것이 장부 아닌 파일 하나를 위해 장부 셋을 건드리는
  일이라서다. 형식은 `serialize/activity.ts`
- 쓰기 직전에 자기가 낼 바이트를 로더로 되읽는다 — 되읽을 수 없는 파일은 쓰지 않고,
  그래서 같은 규칙에 대한 문장이 두 벌 있지 않다
- 지금 파싱되지 않는 파일 위에는 쓰지 않고 거부한다. 누군가의 반쯤 된 편집이나 병합의
  잔해를, 되돌릴 것 없이 덮어버리지 않기 위해서다

### core/arith — 판정 산술

그래프에서 값을 계산하는 곳. AI가 닿을 수 없고, 닿을 AI도 없다. 입주자는 넷 —
**색 사슬**, **닫힘**, **번들**, 그리고 그 셋이 이미 말한 것을 세는 **보드와 vitals**.

- 색 — 위에서부터 첫 일치: missing(파일 부재∧참조 잔존) → 문법 위반 → 고아(살아있는
  앵커 0) → **겨냥 규칙 위반**(off-target) → **계획의 순환**(cyclic) → **반려 유효**
  (rejectedHash = 현재 페이로드 hash) → 장부에 기록 없음 → approvedHash ≠ 현재 hash →
  green. 여덟 판정이 각각 순수
  술어 함수(`isMissing`·`hasSchemaViolation`·`isOrphan`·`isOffTarget`·`isCyclic`·
  `isRejected`·`hasApproval`·`isHashMatched`)이고,
  조합 함수는 우선순위만 쥔다 — 조건이 자라면 술어가, 순서가 바뀌면 조합이 바뀐다.
  반려가 승인보다 앞에 서 있어 둘 다 있으면 반려가 이긴다. canon의 모든 타입이
  색을 받는다. 색 밖에 남는 것은 삭제뿐이다: 기록은 지운다고 없던 일이 되지 않는다
- 장부 세 권의 레코드와 sha256 함수는 `Ledgers`(approvals·rejections·acceptances·
  hash) 한 묶음으로 주입받는다 — 해시는 daemon의 것이고 core는 브라우저에서도 돈다.
  feed는 이 묶음에 들어가지 않는다 — 색의 입력이 아니다.
  `contentHashOf`가 승인·반려·닫힘의 문과 술어가 같은 것을 해시하게 하는 한 함수다.
  삭제 제안은 페이로드 안에 있어 전용 분기가 없다: 적으면 changed, 벗기면 도로
  green. spec에 없는 id의 레코드는 무시된다 — 삭제된 노드의 이력이고, 복원되면
  내용이 맞는 한 그대로다
- **닫힘의 주체는 둘이다**(`core/graph/closure-kinds.ts`) — AC는 그것을 CLAIMS하는
  Evidence로, WorkItem은 그것을 CLAIMS하는 CompletionReport로 닫힌다
  (2026-08-17에 WorkLog·ADDRESSES에서 옮김: ADDRESSES는 "어느 작업 항목 밑의 작업인가"라는
  사실로 남고, 닫힘은 완료 보고서가 말한다). 어떤 타입이
  어떤 관계로 닫히는지는 `ANCHOR_RULES`와 같은 성격의 canon 사실이라 core/graph의 표
  한 곳에 있고, 산술은 주체에서 그 표를 읽는다 — 두 주체가 두 코드 경로가 아니라
  목록만 다른 하나다. 레코드는 자기가 무엇을 닫았는지(kind — `criterion`·`workItem`;
  장부의 키는 `acHash`·`taskHash`로 얼어 있어 태그만 바뀌었다)를 함께 들고, 종류가
  다른 레코드는 hash가 맞아도 서지 않는다
- 닫힘(`closure.ts`) — 주체의 open/closed와, 큐가 물어야 하는지. 판정은 **목록**에
  대한 것이다: 그 주체를 claim하는 살아있는 노드 전부의 id→hash. acceptance 기록이 있고
  **주체의 hash가 그대로**이고 **기록된 목록이 지금 목록과 같으면**(같은 id, 같은 hash,
  더도 덜도 없이) closed; rejections에 청구자 목록을 실은 기록이 같은 두 조건으로
  서면 "left open"(마크는 open, 사유가 함께). 그 목록의 키는 주체마다 다르다 — AC면
  `evidence`, WorkItem이면 `reports` — 이고 한 기록이 둘을 함께 싣는 일은 없다. 둘 다 아니면
  아무도 이 목록에 대해 말한 적이 없는 것 — `closureAsks`가 참이고 큐가 묻는다. 청구가
  추가·철회·수정되거나 주체가 고쳐지면 어느 기록이든 산술로 실효한다. 색은 등록의 축,
  마크는 충족의 축 — 서로 다른 답을 낼 수 있고 그래야 한다(green+open = 확정됐고 청구
  대기; yellow+closed도 가능). 둘이 만나는 곳은 하나뿐: 주체의 **문구 자체**가 반려
  중이면 닫힘을 묻지도, 쓰지도 않는다
- 번들(`bundles.ts`) — 리뷰 큐. 먼저 Work report: Journal마다 실행 층(과 거기 매달린
  위성)만 걸어 서브트리를 묶고, 그다음 **어느 살아있는 WorkLog도 RECORDS하지 않는
  yellow Finding은 각자 Finding 번들**(`finding:<id>`, 자기 한 노드)로
  세운다 — 여기서 세워 covered에 넣어야 다음 줄이 같은 노드를 한 줄짜리 Work report로
  다시 세우지 않는다. 이어서 Journal이 닿지 않는 나머지 실행 yellow는 각자 뿌리. 다음
  Spec approval: 순위표(Decision → Goal → Actor → UseCase → Scenario → SR →
  Requirement → AC → Constraint → 설계 타입 → 실행 → 도메인, 위성은 가장 깊은 부착
  노드의 순위 뒤)로 훑어 아직 어느 번들에도 안 든 yellow를 만나면 뿌리로 삼고, 거기서
  닿는 서브그래프의 yellow∪반려를 멤버로, green을 '무수정 확인' 목록으로 담는다.
  **순위는 거주가 아니다.** Decision은 plan 서랍에 살면서 Goal 위에 선다 — 거주는 어느
  폴더에 파일이 있는지를, 순위는 무엇이 무엇을 담는지를 말하는 별개의 축이다. 결정이
  yellow일 때 그 AFFECTS 파급 전체(Goal도 Term도 모듈과 똑같이)가 한 판단거리이고,
  그것을 한 번들로 모을 수 있는 것은 그들 전부보다 위에 있는 타입뿐이다.
  **엣지를 어느 쪽으로 걷는지도 순위가 답한다.** 순위를 따라 내려가거나 같으면 나가는
  엣지를 앞으로, 거슬러 오르면 들어오는 엣지를 뒤집어. 앵커 표가 아니다 — 앵커 표는
  무엇이 노드를 그래프에 **붙드는지**를, 순위표는 무엇이 무엇을 **담는지**를 말한다.
  자기가 그린 엣지로 붙드는 타입(로그의 ADDRESSES, Evidence·CompletionReport의
  CLAIMS)이 전부 순위를 거슬러 오르는 동안은 두 표의 답이 우연히 같았고, Decision이
  그 우연을 깼다: 자기 AFFECTS로 붙들리면서 그 대상들보다 위에 선다. **같음은 아래로
  센다** — `DEPENDS_ON`·`REFINES` 같은 동급 엣지와 부착 노드의 순위를 빌린 위성이
  걸려 있어, 엄격 비교로 쓰면 그 위성들이 전부 제 번들을 세운다.
  도메인은 싱크라 walk가 내려가지 않는다(MENTIONS는 참조다 — 따라가면 용어집이 모든
  번들에 들어간다). 예외는 `AFFECTS` 하나다: 개정은 참조가 아니라서, 결정이 고쳐 쓰는
  용어는 그 이유가 적힌 카드에 함께 실린다. **한 걸음뿐**이고, 그 Term의 DENOTES는 다시
  참조라 거기서 멈춘다. side를 건너는 엣지는 걷지 않는다 —
  `Decision —RESOLVES→ Finding`은 합법이고 검증도 통과하지만, 결정이 발견에 답한다고
  작업 보고서를 스펙 승인에 끌고 들어오지는 않는다. 뿌리 선택만 covered를 보고
  도달은 안 본다 — 두 뿌리가 닿는 노드는 두 번들에 다 실리고 `sharedWith`로 서로를
  가리킨다. Term·DE는 마지막에 각자 단일 번들. 마지막으로 두 closure: 주체가 green이고
  claimant(AC면 CLAIMS하는 증거, WorkItem이면 CLAIMS하는 CompletionReport)가 하나 이상
  **전부 green**인데 지금 목록에 대해 closed도 left open도 말해진 적 없는 주체(문구가
  반려 중이거나 non-green이면 제외; 미승인 claimant가 하나라도 있으면 그냥 open, 큐 밖).
  정렬은 AC closure → Completion → Spec approval → Work report → Finding,
  그 안에서 멤버 mtime 최솟값이 오래된 것 먼저. 단독 발견이 맨 뒤인 것은
  그 카드가 결정하는 것이 없기 때문이다 — 읽는 것이 전부이고, 답은 나중에 누군가
  쓰는 Decision이다. 뿌리는 yellow만이다 — 반려된 노드와 `premature`
  로그는 yellow 뿌리가 닿을 때 red 멤버로 남고(판정하는 사람이 봐야 하므로), 홀로
  남으면 큐를 떠난다(에이전트 차례)
- reviewGraph — 상태 목록(각 상태에 approval·rejection 레코드, AC의 closure와 left-open
  기록, 겨냥 규칙이 쓴 문장 `problem`, 그리고 Requirement·Scenario의 `satisfaction`을
  실어),
  답하는 파일이 없는 id와 그것을 이름하는 참조들, 읽히지 않는 파일들을 한 번에
  조립한다. `spec.review`와 `shall check`의 gap이 같은 산술을 읽는다
- satisfaction — `satisfaction.ts`의 롤업 하나, vitals가 만드는 **유일한 새 판정**.
  기준을 가질 수 있는 두 타입(Requirement·Scenario — 문법표에서 `HAS_CRITERION`의
  출발 타입을 읽는다)에 대해, 파일이 쓴 기준이 전부 closed면 `sat`, 하나라도 아니면
  `unsat`, 쓴 기준이 없으면 null(미명세이지 미충족이 아니다 — 배지 없음). "있다"는
  파일이 쓴 줄이고 "충족"은 살아있고 닫힌 것이라, 답하는 파일이 없는 기준을 쓴
  캐리어는 unsat이다(구멍 자체는 Fix Spec의 행). 닫힘은 색을 읽지 않으므로 문구가
  반려된 기준도 닫혀 있으면 닫힌 것이고, red 기준 옆에 Sat이 설 수 있다.
  `reviewGraph`가 캐리어마다 이 말을 상태에 싣고 vitals가 그 말을 센다 — 배지와
  비율이 한 필드다
- vitals — `vitalsOf(graph, ledgers)`. 리뷰를 한 번 돌리고 전부 거기서 읽는다:
  Progress 4율(Scenario·Requirement 충족률 = sat / 기준을 하나 이상 쓴 캐리어, 분모
  밖의 미명세 수를 곁에 싣는다; AC 닫힘률 = closed / 모든 기준; WorkItem 완료율 =
  done / **모든** WorkItem, blocked 포함 — ready만 분모로 잡으면 상류가 막힐수록
  오르는 역설이 생긴다)과 그 드릴다운(unsat 캐리어와 미결 기준 수; open 기준의 사유
  셋 — 증거 없음 / 심사 대기(큐가 지금 카드를 자를 때만 `closure:<AC>` id, 미승인
  증거면 null) / 사람이 열어 둠(rationale 전문); 미완 WorkItem의 평면 목록, 각자
  ready·blocked 단어와 함께 — 다른 행들과 같은 폼이고 차단 원인은 싣지 않는다), 그리고
  Spec Health 7규칙(기준 없는 Requirement, 기준 없는 Scenario, UseCase를 수행하지
  않는 Actor, Scenario가 없는 UseCase, 책임에 닿지 않는 Goal — `PURSUED_BY → PERFORMS →
  DETAILS → DERIVES_RESPONSIBILITY` 사슬을 SR에서 거꾸로 한 번 flood하고 `REFINES`는
  내려간다, WorkItem을 할당하지 않는 Module, 어떤 WorkItem도 겨냥하지 않는 AC).
  규칙은 잔여층이다 — red(Fix Spec)도 yellow(리뷰 큐)도 아닌 것만 — 규칙 수준에서
  배타적이고 노드 수준에서 포함적이다: 색과 무관하게 그 타입의 살아있는 노드 전부를
  검사하고 행은 색을 싣지 않는다. 일곱 행은 늘 일곱, 위반 먼저. 본문은 읽지 않는다
  (시나리오의 종류는 본문 절이라, '주 시나리오 없는 UC'는 '시나리오 없는 UC'로
  묻는다). 종합 점수 없음. `empty`는 살아있는 노드도 거부된 파일도 없을 때
- 아직 안 온 것 — 낡음·게이트. 색과 같은 방식으로, 저장 없이 계산될 것이다

### core/serialize — 파일 형식

그래프와 바이트 사이. 순수 함수만 있다 — 파일시스템도, 시계도, 난수도 없다.

- **동결된 형식** — frontmatter 블록(`short_name`·`name`·`edges`, WorkLog에만
  `commits`, Finding에만 `blocking`·`relatedNodes`, 그리고 기계 블록
  `deletionProposed`) + 자유 마크다운 본문. UTF-8, BOM 없음, LF, 말미 개행 하나.
  키 순서·엣지 순서가 각각 하나뿐이고, 본문은 저자의 바이트 그대로다
- **승인 페이로드** — `<type>/<id>` 한 줄 + 정칙 파일 전체. 경로 정체성이 앞에 붙어
  승인된 파일을 다른 id로 복사해도 레코드가 따라가지 않고, 해시가 정칙 emit
  기준이므로 되읽어 같은 노드가 되는 재포맷은 승인을 살려 둔다. 파일 안에 승인은
  없으니 뺄 블록도 없다
- **장부 형식 세 권** — `.shall/ledger/approvals.yaml`(nodeId → `{approvedHash, by,
  at}`), `rejections.yaml`(nodeId → `{rejectedHash, by, at, rationale}` — rationale은
  여러 줄일 수 있고 `\n` 이스케이프의 따옴표 스칼라로 앉는다), `acceptances.yaml`
  (acId → `{acHash, evidence: {evId → hash, …}, by, at}` 또는 workItemId →
  `{taskHash, reports: {crId → hash, …}, by, at}` — 청구자 맵은 항목 하나
  이상의 중첩 맵). 셋 다 id 바이트 순, 키와 값 전부 같은 스칼라 규칙, 같은 yaml
  계약(`yaml.ts` 한 곳)으로 읽고, 루트 읽기(BOM/CRLF → YAML → 맵 → 맨몸/따옴표
  쌍둥이 키 → id 판정)는 `ledger-common.ts` 한 곳을 지난다. 산문이 없는 순수
  레코드라 md가 아니라 YAML이다. 관대하게 읽고 정칙으로 쓰며, 안 읽히면 파일 전체에
  문장 하나
- **feed 형식** — `.shall/ledger/feed/YYYY-MM.yaml`(`serialize/activity.ts`)은 장부가
  아니라 **끝난 run의 목록**이라 루트가 맵이 아니라 YAML 시퀀스다: 레코드마다
  `{at, kind, refs, summary}`(`at`은 따옴표 ISO 인스턴트, `kind`는 넷 중 하나 —
  에이전트가 `shall log`로 남기는 specify_done·plan_done·work_done·raise_landed,
  `refs`는 node id만의 flow 시퀀스·비면 `[]`, `summary`는 에이전트의 한 줄이고 항상
  있다), 붙인 순서 그대로, 정렬도 중복 제거도 없고, 빈 feed는 0바이트. 사람의 판정은
  레코드가 아니다 — 장부에 있고, feed는 그것을 되풀이하지 않는다. 달은 UTC(`at`의
  앞 일곱 글자)다 — 어느 파일에 있는지에 아무것도 걸려 있지 않다. 세 권과 같은
  스칼라 규칙·같은 yaml 계약이지만 `ledger-common.ts`의 맵 루트 읽기는 지나지 않는다.
  관대하게 읽고(block·flow refs, 따옴표 유무, 키 순서, 빠진 `refs`·`summary`) 정칙으로
  쓰며, 모르는 kind나 node id가 아닌 ref는 빈 행이 아니라 **파일 전체에 대한 문장
  하나**로 거부한다 — store가 못 읽는 달 위에는 쓰지 않기 때문이다
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
  `acceptClosure`·`leaveOpen`), 그리고 보드의 하나(`workBoard`), vitals의 하나
  (`vitals` — 읽기, 아무것도 쓰지 않고, 장부가 안 읽히면 통째로 거부한다; 시계도
  싣지 않아 페이지의 "Computed"는 답이 도착한 순간이다), 그리고 활동 feed의
  읽기 하나(`activity` — 달 목록과 한 달의 레코드, 둘 다 최신순; 기본은 달력의 이달이
  아니라 **파일이 있는 가장 최근 달**, 목록 밖의 달은 `missing`, 철자가 틀리면
  `invalid`, 못 읽는 달은 파일의 문장을 실은 `conflict`; 쓰는 쪽 `log`는 경로 가족이라
  아래에). 문장과 순서가 door의 것이고, 거부 종류(`invalid`·
  `conflict`·`missing`)가 여기서 상태 코드를 얻는다. `approve`·`approveNodes`가 green의,
  `reject`가 반려 red의, `acceptClosure`가 closed의, `leaveOpen`이 left-open의 유일한
  제조 경로다 — 각각 장부에 레코드를 쓰고 노드 파일은 건드리지 않으며, feed에도
  아무것도 쓰지 않는다: 사람의 판정은 장부에만 살고, feed에 줄을 붙이는 문은
  에이전트의 `log` 하나다.
  `approveNodes`는 전부-아니면-무다: 가드를 전부 지난 뒤 한 번 쓰고, 하나라도 막히면
  막힌 것을 전부 나열하며 아무것도 안 쓴다. `acceptClosure`는 id 하나를 받아 **지금 그
  주체를 claim하는 것 전부**로 닫고(AC면 CLAIMS하는 증거, WorkItem이면 CLAIMS하는 보고서
  기록), `leaveOpen`은 같은 목록에 사유를 붙여 열어 둔다; `workBoard`는 아무것도 쓰지
  않는 읽기 하나다 — 보드의 모든 열이 장부에서 세어지므로 장부가 안 읽히면 통째로
  거부한다;
  둘 다 상대 장부의 기록을 먼저 지우고 쓴다(사이에서 실패하면 아무 말도 없는 상태 =
  큐가 다시 묻는 안전한 쪽). 청구가 하나도 없거나, 청구 중 green이 아닌 것이 있거나(그
  id를 이름해 거부), 주체의 문구가 반려 중이면 둘 다 거부.
  에이전트의 계약은 파일 전용이라 판정의 문을 두드릴 이유가 없고 — 에이전트가
  두드리는 유일한 쓰기 문은 `spec.log`이며, 그것은 판정이 아니라 feed 한 줄이다 —
  장부는 deny 규칙이 가린다(관례 방어 — 로컬 토큰은 daemon이 신뢰하지 않는 호출자가
  생기는 날의 일).
  세 권 중 하나라도 안 읽히면 리뷰·큐·판정은 어느 권인지 이름한 문장 하나로 거부한다
  — 전부-yellow는 색을 입은 거짓말이다. sha256은 host의 `payloadHash` 하나다
- `spec.check`·`spec.status`·`spec.board`·`spec.scaffold`, 그리고 `spec.log`까지 —
  프로젝트 id가 아니라 **경로**를 받는 다섯 프로시저. 레지스트리는 이 기계에서 누군가
  UI로 연 폴더의 목록이고, 갓 clone한 checkout은 그 목록에 없다. 한 번 열어야만 쓸 수
  있는 스펙은 그것을 나르는 repo보다 덜 이동적이다. 다섯 다 `projectRootAt` 한 문으로
  위로 걸어 올라가 루트를 찾고, 거기서부터의 여섯 주소는 `specPathsOf` 한 곳에서 나온다 —
  id로 찾는 쪽(`projectSpecFor`)이 보는 것과 **같은** 주소들이라 두 갈래가 서로
  어긋날 수 없다. `status`는 `reviewGraph`가 낸 상태에 타입·밴드·이름·파일·그 파일이
  쓴 엣지를 얹을 뿐 색을 다시 계산하지 않고, `board`는 `workBoard`와 같은
  `boardOver` 하나다 — 화면과 터미널이 두 개의 보드를 보지 않는다. `check`·`status`의
  `--scope`는 절대 경로·호출자 cwd 기준·spec 상대 중 어느 철자로 와도
  `scopePrefixesOf`가 spec 폴더 밑의 경로로 앉히고(`path`는 daemon의 cwd가 아니라
  **호출자가 서 있던 폴더**다 — 데몬 하나가 이 기계의 모든 checkout을 서빙하고 그중
  어디에도 서 있지 않다), 밖을 가리키면 문장 하나로 거부한다. 좁히는 것은 보고할
  목록뿐이지만 `check`의 note만은 **읽기 전에** 좁는다 — 노드마다 파일을 다시 여는
  유일한 loop이고, 에디터 훅이 저장마다 부르는 명령에서 아무도 묻지 않은 파일은
  열지 않는 편이 옳다. `scope` 키가
  `.default([])`가 아니라 `.optional()`인 것도 이유가 있다: 그 필드를 모르던 CLI가
  새 daemon과 계속 말한다. `scaffold`는 타입을 대소문자 무시로 해석해 다음 빈 id로
  시작 파일을 쓰고 그 경로를 답한다. `log`(`spec-activity.ts`의 `logActivity`)는
  에이전트가 두드리는 유일한 쓰기 문이다 — kind 넷(specify_done·plan_done·work_done·
  raise_landed) 중 하나, 한 줄짜리 summary, `--refs`의 node id들을 받아 데몬의 시계로
  `ledger/feed/`의 달 파일에 레코드 하나를 붙이고 `{ok: true}`만 답한다. 넷 밖의
  kind는 목록과 함께, 빈 ref와 node id 모양이 아닌 ref는 항목을 이름해 거부하며,
  refs는 trim·순서 보존 중복 제거다. feed에 쓰는 문은 이것 하나다 — 판정의 문들은
  feed를 모른다. feed를 에이전트에게 돌려주는 프로시저는 없다(설계): 과거가 필요한
  에이전트는 `status`와 `board`에 묻는다
- **폴더를 지켜본다 — daemon이 요청 사이에 쥐는 첫 자원.** `/api/projects/:id/events`
  하나가 SSE로 열리고, 그 프로젝트의 `.shall` 아래에서 무엇이든 바뀌면 `change` 한
  줄을 보낸다. 쓰기 문(`writeBytes`)에서 신호를 내지 않는 이유는 그것이 **daemon 자신의
  쓰기만** 잡기 때문이다 — 그건 화면이 이미 다시 묻는 경우이고, 정작 문제인 것(에이전트가
  제 도구로 쓴 마크다운, `git checkout`, 편집기)은 파일시스템에서만 보인다. 감시는
  **디렉터리마다 비재귀**로 건다: Linux에서 `recursive: true`는 파일마다 watch를 거는 JS
  폴백이고, 이 시스템의 모든 쓰기는 `tmp → rename`이라 대상 inode가 사라져 **같은 파일의
  두 번째 쓰기부터 조용해진다**(그 함정이 `spec-watcher.test.ts`의 첫 테스트다). 폴더당
  하나의 피드에 구독자 여럿, 마지막이 떠나면 watch를 닫고, watch가 깨지면 그 프로젝트의
  연결을 **끊는다** — 브라우저의 재연결이 유일한 회복 경로다. 프로젝트는 스트림을 열기
  **전에** 레지스트리로 확인한다: `EventSource`는 열렸다 닫힌 연결은 영원히 다시 걸고
  거절된 연결은 포기하므로, 모르는 id는 404여야 한다. shutdown은 `closeAllFeeds()`를
  먼저 부른다 — 열린 스트림은 끝나지 않은 응답이고 `server.close`는 그것을 기다린다
- 기동할 때와 프로젝트를 열 때 `~/.shall/templates`의 참조 템플릿을 타입마다 바이트
  비교해 다른 것만 다시 쓰고(canon에서 빠진 타입의 템플릿은 지운다), `spec/` 폴더가
  있는지 보장하고, 옛 Shall이 프로젝트에 남긴 `.shall/templates`는 지우고,
  `.claude/settings.json`에
  `Read(~/.shall/**)`·`Edit(/.shall/ledger/**)` 두 deny 규칙을 병합해 둔다(없는
  규칙만 뒤에 붙이고, 파싱 안 되는 파일은 바이트 그대로 두는, 조용한 관례 방어)
- **상시 층은 `.claude/rules/shall.md` 한 장이다.** 매 세션 자동으로 읽히는 자리에
  Shall이 **통째로 소유하는** 생성 파일로 두고(템플릿처럼 바이트가 다를 때만 다시
  쓴다), 파일 스스로 말하지 못하는 것만 반 페이지로 싣는다 — 쓰기는 제안이라는
  것, 삭제는 `deletionProposed`라는 것, 장부는 열지 않는다는 것(거기 남기는 한 줄은
  `shall log`로 부탁하고 되읽지 않는다는 것), 색은 계산하지 말고 `shall status`에
  묻는다는 것, 노드는 `shall add-spec-node`로 시작한다는 것(그
  주석 머리말이 타입의 키와 관계가 적힌 유일한 자리다), 작업 항목은 모듈에 매달린다는
  것(그리고 매달리지 않으면 `shall check`가 고아로 말한다는 것). 옆집 `settings.json`과 태도가 정반대인 것이 요점:
  저쪽은 남의 문서에 두 줄을 병합하고, 이쪽은 Shall의 출력이 남의 폴더에 산다.
  사람이 손댄 것은 다음 open에 사라지고, 자기 규칙은 옆 파일에 쓴다
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

- **화면은 스스로 최신을 유지한다.** 프로젝트 하나에 `EventSource` 하나(`live.tsx`의
  `LiveProvider`)가 daemon의 `/api/projects/:id/events`를 듣고, **데이터는 하나도 나르지
  않고** 틱만 올린다 — 각 표면은 이미 자기 질문을 알고 있고 모르던 것은 *언제*뿐이었다.
  그래서 무효화할 캐시도, 병합할 응답도 없다. 배선의 규칙 하나: **마운트 effect는
  건드리지 않고 두 번째 effect를 더한다.** 그 effect들이 스켈레톤과 거부와(SpecPlane에서는)
  열려 있는 다이얼로그 전부의 리셋을 소유하므로, 틱을 그쪽 의존성에 넣으면 파일이
  움직일 때마다 connect 다이얼로그가 닫힌다. 두 번째 effect는 아무것도 지우지 않고 다시
  읽기만 하며, 실패하면 화면에 있는 것을 그대로 두고 말하지 않는다(다음 변경이 다시
  묻는다). 250ms 코얼레스 — UI 자신의 쓰기가 부른 리페치와 watcher가 부른 리페치가
  겹치지 않게. focus도 틱을 올린다: watcher는 `.shall`만 보므로 터미널의 `git commit`은
  보이지 않는다
- **갱신은 조용하다.** 배너도 토스트도 없다 — 이미 읽고 있는 것이 사실이 되었다고
  사람을 방해할 이유가 없다. 예외는 하나, **편집 중인 노드가 디스크에서 바뀐 경우**:
  NodePanel이 Save 옆에 한 문장을 놓는다(막지는 않는다 — 초안과 파일 중 무엇이 남을지는
  사람이 안다). mtime이 아니라 **바이트**로 비교한다: 같은 내용을 다시 쓴 것도 mtime은
  움직이고, 손쓸 수 없는 경고는 경고를 무시하는 법을 가르친다
- **사이드바 뱃지**: Review Queue는 카드 수, Work Board는 Fix Spec + Implement 행 수.
  0이면 없다 — 빈 큐는 조용함으로 읽히는 편이 나은 상태다. 요약 프로시저를 새로 만들지
  않고 패널이 부르는 그 프로시저 둘을 부른다(어긋날 둘째 자리를 만들지 않으려고), 컨트롤
  플레인에 있을 때만 묻고, 실패하면 이전 숫자를 지킨다 — 뱃지는 패널을 가리키는 손가락이지
  사실이 사는 집이 아니다. Activity Feed는 뱃지 없음 — 큐가 아니고, 거기 있는 것은
  아무도 기다리지 않는다. Vitals도 같은 이유로 없음 — 위반은 오류가 아니고, 누구의
  차례도 아니다

- Control plane — review queue · work board · activity · vitals. 활동 feed 하나만
  빼고 전부 core/arith 계산 결과의 표시다(feed는 파일을 읽는다). **Work Board**도
  채워졌다: 위가 Fix Spec(모든 red — 사람의 반려가
  먼저, rationale은 **전문**; 그다음 문법 red, 구멍, 안 읽히는 파일), 아래가
  Implement(미완료 ∧ 선행 전부 닫힘 ∧ 상향 사슬 all-green인 WorkItem만 — 조건 미달은 이유
  없이 아예 안 보인다). 두 열 다 저장 없음. **Review Queue**가 채워졌다: 목록은 `[종류 배지] 제목 — 요약
  수치` 한 줄씩(AC closure → Completion → Spec approval → Work report → Finding,
  오래된 것 먼저), 카드는
  전면에 판정 재료(뿌리의 diff/전문, Journal 본문, AC 본문)·멤버 목록(노드마다
  diff/전문, [Approve]·[Reject…]·[Open in Spec Plane])·접힌 무수정 확인 목록·번들 버튼
  하나 또는 둘([Approve all]/[Accept report]/[Accept finding]/[Close]+[Leave open…]).
  번들은 다섯 종류다 — AC closure · Completion(그 작업 항목을 CLAIMS하는
  CompletionReport 목록, 겨냥한 AC들의 마크를 문맥으로) · Spec approval ·
  Work report · Finding(어느 WorkLog도 RECORDS하지 않는 yellow Finding
  한 장, 두 문이 다 열린 행 하나). 반려는 인라인
  팝오버 — 대상 id·이름, 필수 rationale, 확정/취소 — 이고 카드의 행 우클릭과 스펙
  플레인 카드 우클릭 어디서든 같은 팝오버다. 판정 직후 카드는 큐를 다시 계산하고,
  방금 내린 반려는 페이지의 '최근 판정' 줄에 [Undo]로 남는다. **Activity Feed**도
  채워졌다: `.shall/ledger/feed/YYYY-MM.yaml` 월별 파일 하나를 `spec.activity`로 읽어
  같은 PanelTable 한 장(Kind·Event·Refs·When)으로 — 한 줄에 한 행, 최신순, 접는
  것은 없다(줄마다 run 하나가 사건이라 접을 것이 없다). 행의 kind는 넷(specify_done·
  plan_done·work_done·raise_landed)이 전부이고 문장은 에이전트의 summary 그대로다 —
  사람이 리뷰 큐에서 한 일은 장부에 있고 feed에는 없다. 월은 URL의 `?month=`에
  살고(숨은 상태 없음) 선택은 달 파일이 둘 이상일 때만, 기본은 파일이 있는 가장
  최근 달, refs는 스펙 플레인으로의 링크(`?back=`이 feed와 그 달로 되돌린다),
  Overview 카드는 최신 달의 첫 세 행. feed는 사람용 요약이지 정본이 아니다 — 어떤
  계산도 읽지 않고, 못 읽는 달은 이 패널 하나만 비용이다. 새 채널은 없다: feed
  쓰기도 `.shall` 아래의 변경이라 같은 SSE 틱으로 닿는다. **Vitals**도 채워졌다:
  `spec.vitals` 하나를 Overview 카드와 페이지가 같이 읽어(요약 프로시저 없음 — 둘이
  어긋날 둘째 자리를 만들지 않는다) 카드는 바 넷과 n/m, Spec Health 한 줄, 페이지는
  "Computed" 캡션 아래 Progress 카드(행마다 바·n/m·주석, 펼치면 드릴다운)와 Spec
  Health 카드(일곱 행 전부, 위반 먼저, 펼치면 노드 명단과 채우는 커맨드 한 줄)를
  세로 한 흐름으로. 바는 shadcn 레지스트리의 `progress` 하나를 디자인 시스템에 들인
  것이고, 위반은 red 계열을 쓰지 않는다(조용한 secondary 배지·outline "passed").
  사이드바 뱃지 없음 — 큐가 아니다. 빈 스펙이면 시작 안내가 두 섹션을 대신한다
- Spec plane — 그래프 캔버스(React Flow)와 노드 상세, 그리고 리뷰 표면. 카드마다
  신호등이 색을 달고, id 옆 같은 자리에 둘째 축의 배지를 하나 더 단다 — AC는
  Open/Closed, WorkItem은 Blocked/Ready/Done(Ready 집합은 Work Board의 Implement
  열과 같은 술어다), Requirement·Scenario는 Sat/Unsat(쓴 기준이 없으면 배지 없음).
  페인트는 둘뿐이다: 끝난 말(Closed·Done·Sat)은 채운 에메랄드 pill — 등록 green인
  네모와 같은 색조, 다른 형태 — 이고, 나머지(Open·Blocked·Ready·Unsat)는 디자인
  시스템의 조용한 secondary 배지라 덜 된 것은 색이 아니라 단어로 말한다. 노드
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

`shall` 명령. 계산도 직렬화도 하지 않는 얇은 클라이언트 — 색도 보드도 daemon에게
묻는다. 파일을 스스로 읽어 색을 세는 CLI는 색 사슬의 두 번째 구현이고, 규칙이
움직이는 날 아무도 모르게 낡는다.

- daemon 기동·재사용, 브라우저 열기
- `shall init` — 이 폴더를 프로젝트로 (`projects.create` 위의 얇은 층)
- `shall check [--scope <path>]...` — 노드·관계 수 한 줄 뒤로 `파일 — 문장`을
  출력하고 problem이나 gap이 있으면 exit 1. 승인 여부(yellow·green)는 말하지
  않는다 — 그건 리뷰의 것이다. 그리고 `status`가 생겼기 때문에 그 말이 계속 참일
  수 있다: 색에는 이제 자기 문이 있으므로 검사는 문법의 문으로 남는다. 다만 gap
  하나는 판정에 걸린다 — blocked인 작업 항목 아래 쓰인 WorkLog이고, 아직 아무도 읽고
  동의하지 않은 사슬이 작업 항목을 blocked로 두는 길 중 하나다. `--scope`는 파일
  하나·폴더 하나·행에 찍히는 spec 상대 경로(`intent/Goal`) 중 어느 철자로든 받고
  여러 번 줄 수 있으며, 좁히는 것은 **보고할 목록**뿐이다 — 그래프는 통째로
  읽고(앵커도 엣지의 반대편도 대개 다른 폴더에 있다), 노드·관계 수도 프로젝트
  전체다(수는 폴더가 가진 것, 목록은 물어본 것). **exit 코드는 좁힌 뒤에
  정해진다**: `shall check --scope intent`는 다른 밴드가 구멍투성이여도 0으로
  끝난다 — 한 폴더를 겨눈 빌드 스크립트가 기대하는 것이 그것이다. 장부 세 권 중 안
  읽히는 것마다 `.shall/ledger/<파일> — 문장` 한 행이 problem이고, 두 권이 상하면
  두 행이 선다 — 이 행들에는 scope 밖이 없다: 장부는 spec 폴더 **옆에** 살고, 안
  읽히는 책 하나는 모든 노드의 판정을 오염시킨다. 좁힌 검사를 밖에서 실패시키는
  행도 이것 하나뿐이다
- `shall status [--scope <path>]...` — red·yellow·green을 센 줄 뒤로 노드마다 색,
  그 이유의 한 낱말, 문법이 쓴 문장, 선 반려의 rationale **전문**, 열어 둔 사유,
  AC의 open/closed, WorkItem의 blocked/ready/done. 답이 없는 id와 안 읽히는 파일이 뒤에
  붙는다. 에이전트가 청한 삭제와 그 파일이 쓴 관계 목록은 인쇄되는 행이 아니라
  `--json` 답에 실린다. 장부의 판정을 **읽을** 뿐 하나도 만들지 않는다 — 이 명령이
  있어서 에이전트가 색을 스스로 세어 볼 이유가 없다. 세 권 중 한 권이 안 읽히면 행
  하나로 알리지 않고 **호출 전체를 거부**한다(`check`는 행 하나로 알리고 계속
  센다): 여기 모든 색이 장부에서 세어지므로, 안 읽히는 책 위에 그린 색은 색을 입은
  거짓말이다
- `shall board` — Work Board 두 열(Fix Spec · Implement)을 터미널에. 화면이 보는
  것과 같은 `workBoardOf` 하나이고, 매 호출 계산이라 저장되는 것이 없다. 장부가
  안 읽히면 `status`처럼 통째로 거부한다
- `shall add-spec-node --type <Type>` — 시작 파일 하나를 제자리에 만들고 첫 줄로
  그 절대 경로를 출력한다. 타입은 인자라서 canon이 자라도 명령은 하나이고, canon에
  없는 타입은 전체 목록과 함께 거부된다
- `shall log <kind> <summary> [--refs <id,id>]` — 활동 feed에 한 줄: 한 run이 끝났고,
  무엇을 끝냈는지. kind와 summary는 명령 뒤의 두 위치 낱말이다(summary는 셸에 한
  낱말 — 따옴표로 — 데몬에는 한 줄; 셋째 낱말은 이어 붙이지 않고 usage 오류),
  `--refs`는 쉼표로 가른 node id들이고 두 철자(`--refs a,b`·`--refs=a,b`) 다 받으며
  누적된다. kind는 넷(specify_done·plan_done·work_done·raise_landed)뿐 — 다른 낱말은
  데몬이 목록과 함께 거부한다. 답은 `Logged <kind>.` 또는 거절 한 문장, 그것뿐이다 —
  feed를 되읽는 명령은 없다(설계). 쓰는 손은 데몬이고 시계도 데몬의 것이며, 쓰는
  파일은 장부가 아니라 `ledger/feed/`의 달 파일이다
- `shall help` — 위 모양들이 그대로 인쇄되는 화면 하나를 stdout에. `shall --help`가
  같은 명령이고, 오타 난 명령이 받는 답도 이 화면이다
- **`--json`은 답하는 여섯이 받는다** — stdout에 객체 **하나**, 그것뿐(`log`의
  객체는 `{"ok": true}`). 실패해도 `{"error": 문장}` 하나라 호출자는 어느 쪽이든
  stdout을 한 번 읽고 한 번 파싱한다.
  exit 1은 호출이 실패했거나 `check`가 problem·gap을 찾았을 때뿐이고, red 노드도 선
  반려도 빈 보드도 답이지 오류가 아니다 — **호출자는 코드가 아니라 내용으로
  갈라진다**. 에이전트의 도구가 먹는 계약이 이것이다
- **계약은 낱말이 읽힌 다음부터다.** 이 클라이언트가 읽지 못한 줄 — 그 명령에 없는
  옵션, 값 없는 `--scope`나 `--refs`, `log`의 셋째 낱말, 아무것도 아닌 낱말 — 은
  daemon이 뜨기도 폴더가 읽히기도 전에 stderr로 답하고 exit 1이다: 맞는 모양 한 줄,
  또는 모르는 이름이면 help 화면 통째로. 줄에 `--json`이 있었어도 stdout에는
  아무것도 없다
- 인자 읽기는 `args.ts` 하나이고 아무것도 import하지 않는다 — daemon도 포트도 폴더도
  없이 테스트되는 유일한 부분이라 그 자리를 지킨다. 명령의 모양 표(`SHAPES`)가
  help 화면과 오타에 답하는 한 줄의 같은 출처다. `log`의 kind도 여기서는 검사하지
  않는다 — 영어는 데몬이 쓴다
- `shall approve`·`shall reject`·`shall close`는 영원히 없다: 판정의 제조자는
  브라우저의 사람뿐이고, 에이전트가 장부에 한 줄 쓰게 하는 명령은 자기가 자기를
  어떻게 판정했는지의 기록을 만든다. `shall log`는 그 예외가 아니다: 판정은 쓸 수
  없고, 쓰는 것은 장부가 아니라 feed 한 줄 — 어떤 색도 읽지 않는 파일이다

## 레거시에서 사라진 것

MCP 서버 · webhook 수신 · 외부 cron · 추론 클라이언트와 그 게이트 · 등급/계량 ·
멀티테넌트 격리 · 독립 Verifier (그 리포트는 CompletionReport 노드 타입으로
남았다).

이번 전환으로 둘이 더 빠졌다 — **SQLite 저장소**(정본이 커밋되는 마크다운으로
옮겨갔다)와 **세션/base/draft/제출 기계**(git이 그 일을 한다). 옛 `shall.db`는
마이그레이션 없이 버려진다 — 한동안 `.gitignore`가 그 이름을 계속 무시했지만,
파일이 실제로 지워진 뒤로는 그 줄도 걷혔고 남은 규칙은 `*.tmp` 하나다.

## 얼어붙은 것

아래는 이제 사용자 repo에 바이트로 남는다. 바꾸면 그들의 git 히스토리를 다시 쓰게
하므로, 바꾸지 않는다.

- **파일 형식** — frontmatter 키의 순서(`short_name`·`name`·`edges`, WorkLog에만
  `commits`, Finding에만 `blocking`과 `relatedNodes`, 그리고 `deletionProposed`),
  스칼라의 맨몸/따옴표 판정, 본문은 자유 마크다운 그대로, LF·BOM 없음·말미 개행 하나.
  Finding의 두 키는 2026-08-21에 붙었고 **둘 다 선택**이라, 어느 쪽도 안 실은 파일은
  예전과 바이트가 같다 — 그래서 기존 승인이 전부 그대로 선다. `blocking`은 진짜 YAML
  boolean이고 `true`일 때만 한 줄이 나온다(부재 = 차단 아님). `relatedNodes`는 힌트라
  그 id가 아무 파일에도 응답하지 않아도, 목록이 비어 있어도 잘못이 아니다.
  `approval` 블록은 2026-08-16에 **의도적으로 뺐다** — 외부 사용자가 생기기 전의
  개정이고, 승인은 장부로 갔다.
  관대한 **읽기의 수용 범위**도 형식의 일부라 `yaml` 패키지 버전이 정확히 고정돼 있다
- **승인 페이로드** — `<type>/<id>` 한 줄 + 정칙 파일, sha256. 이 정의가 바뀌면
  장부의 모든 레코드가 yellow로 돌아간다
- **장부 세 권** — `.shall/ledger/approvals.yaml`(nodeId → `{approvedHash, by, at}`),
  `rejections.yaml`(nodeId → `{rejectedHash, by, at, rationale}`, 열어 둔 기록이면
  `evidence:` 또는 `reports:` 맵 하나를 더), `acceptances.yaml`(acId → `{acHash,
  evidence: {evId → hash}, by, at}` 또는 workItemId → `{taskHash, reports: {crId → hash},
  by, at}`), id 바이트 순, 파일 형식과 같은 스칼라 규칙과 yaml 계약. 그 맵의 키는
  청구자 자신의 id라 개명이 닿지 않는다 — `VR-` id를 담은 책도 옛 접두의 id를 담은
  책도 그대로 서고, 그래프만 그 이름에 응답하지 않게 된다. `reports:`·`taskHash` 키
  자체도 그대로다 — 2026-08-23에 타입은 WorkItem·CompletionReport로, 코드 안의 닫힘
  주체 태그는 `workItem`으로 바뀌었지만 바이트는 한 글자도 움직이지 않았다. 뒤의 두 권은
  2026-08-16의 리뷰 큐 라운드에 얼었고, 작업 항목 쪽 두 키는 2026-08-17에 나란히 얼었다 —
  criterion 레코드의 바이트는 그대로다
- **엣지 #22·#23·#24의 방향** — `WorkItem —TARGETS→ AcceptanceCriterion`,
  `WorkLog —ADDRESSES→ WorkItem`, `Evidence —CLAIMS→ AcceptanceCriterion`,
  `CompletionReport —CLAIMS→ WorkItem`
  (2026-08-16에 옛 `IS_PLANNED_BY`·`IS_ADDRESSED_BY`·`IS_CLAIMED_BY`를 뒤집었다). 문법의
  다른 행은 얼지 않았지만, 이 네 행은 아래층 파일의 바이트에 남으므로 여기 적는다.
  마지막 행의 출발 타입은 2026-08-21에 `VerificationReport`에서 개명했고, 2026-08-23에는
  plan 층의 세 타입이 한꺼번에 `Module`·`WorkItem`·`CompletionReport`로 개명했다(옛
  이름과 표는 `docs/Shall_Plan_Layer_Refactor_Spec.md` §1) — 제안되는 접두도 `M-`·`WI-`·
  `CR-`로, 접두는 새 id에 대한 제안일 뿐 옛 id의 규칙이 아니라 `git mv` 셋이면 옛
  프로젝트가 따라오고, 방향은 넷 다 그대로다. **얼린 것은
  방향이지 이름이 아니다** — 항목의 제목이 그렇게 적혀 있고, 근거도 그 차이에 있다.
  방향을 뒤집으면 그 관계를 적은 줄이 반대편 파일로 옮겨 가 이미 쓰인 스펙을 양쪽
  끝에서 다시 써야 하지만, 이름을 바꾸면 서랍 하나를 `git mv`하는 것으로 끝난다 —
  옛 서랍에는 로더가 로스터를 이름한 문장으로 답하고, 파일 안의 바이트는 한 줄도
  움직이지 않는다(그 타입 노드들의 승인만 페이로드의 `<type>/<id>` 때문에 실효한다).
  남의 파일을 다시 쓰게 하는 것과 서랍 이름 하나를 옮기게 하는 것은 같은 위험이
  아니고, 이 freeze는 앞의 것을 막으려 쓰였다. 근거는 하나 더 있다: 이 문서는
  이미 한 번 근거를 대고 freeze를 깼다 — 위 `approval` 블록을 뺀 것이, 외부 사용자가
  생기기 전이라는 근거로. 개명은 정확히 그 근거 위에 선다. 그 시점이 지나면, 이 문단은
  개명을 금지하는 문단이 된다
- **경로가 정체성** — `.shall/spec/<band>/<Type>/<id>.md`. 밴드 폴더 넷, 폴더가
  타입, 파일명이 id, 엣지는 출발 파일에만, 시각은 `mtime`

아직 얼지 않은 것: CLI 서브커맨드의 이름과 출력(`--json` 객체의 필드 이름들도
아직 여기 있다 — 2026-08-23의 `taskState → workItemState`, `spec.taskBoard →
spec.workBoard`, 보드 행 키 `task:<id> → work-item:<id>`, 번들 종류 `task-closure →
work-item-closure`가 그 자유 안에서 한 일이다), `spec.check`·`spec.status`·`spec.board`
응답의 모양, `spec.vitals` 응답의 모양,
리뷰 응답과 리뷰 큐 응답의 모양(장부의 by·at·rationale과 AC의 closure, 2026-08-24의
Requirement·Scenario `satisfaction`이 상태에
실리는 것, 번들의 필드들 — 전부 이 자유 안에서 한 일이다), 그리고 활동 feed의
레코드 형식(`ledger/feed/YYYY-MM.yaml`의 시퀀스, 레코드마다 `{at, kind, refs,
summary}`)과 kind 목록 넷, `shall log`·`spec.log`·`spec.activity`의 모양. feed는
사용자 repo에 바이트로 남지만 위의 세 권과 함께 얼지 않았다 — 어떤 계산도 읽지
않으므로 형식이 바뀌어도 돌아가는 색은 없고, 옛 달 파일이 안 읽히면 그 달의 패널
하나가 비용이다.
