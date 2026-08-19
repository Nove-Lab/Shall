# `/shall:plan` 1차 — 프로세스 정본 + 플러그인 증분 + check 증분 + 도그푸딩

출처: [`./Shall_Plan_Work_Order_v1.md`](./Shall_Plan_Work_Order_v1.md) — 작업 지시서 v1 사본(원본은 작성자 로컬).

> 이 파일은 컴퓨터를 옮겨 이어서 작업하기 위해 임시로 커밋한 작업 계획이다(2026-08-19 합의본). 라운드가 끝나면 지시서 사본과 함께 삭제한다.

## 배경 (Context)

`/shall:specify`는 정본(`docs/Shall_Specify_Process_v1_3.md`)·플러그인(`plugin/commands/specify.md`, `skills/shall-specify`, `skills/shall-authoring`)·훅·린트까지 갖춰져 있고, demo2(`~/dev/Shall-Demo/demo2`)는 66/66 green으로 loop-ready다. plan 플레인은 아직 아무것도 없다(`plugin/README.md`의 "Not yet"). 지시서는 같은 패키지를 한 층 아래에 요구한다: (1) `docs/Shall_Plan_Process_v1.md`, (2) `commands/plan.md` + `skills/shall-plan/` + shall-authoring 증분, (3) CLI/core 증분(plan 4종 템플릿 힌트, `shall check` plan 심), (4) 상시 층 최소 추가, (5) demo2에서 Haiku 도그푸딩.

**모든 산출물의 최우선 규칙**: 경쟁 도구 이름·이론·논문·인명·방법론 고유명사 금지. 전부 Shall 자신의 행동 규칙으로 서술한다. (specify 정본의 머리말은 외부 도구를 인용하므로 plan 정본은 그 머리말 형식을 따르지 않는다.)

**일관성 > 발명**: 구조·문구 스타일·승인 흐름을 specify 패키지와 같게 한다. 다르면 그 자체가 결함.

## 조사로 확정된 사실 (다시 검증하지 말 것)

- **plan 밴드 문법은 이미 완비** (`core/graph/grammar.ts:51-57,67-71,89,94,118-121,128`): `SR —IS_REALIZED_BY→ MD`(SR 파일에 기록), `MD —EXPOSES→ IF`, `MD —CONSUMES→ IF`, `IF —CARRIES→ DS`, `MD —ALLOCATES→ IT`, `IT —DEPENDS_ON→ IT`, `IT —TARGETS→ AC`(태스크 자기 파일), `DS —REPRESENTS→ DE`, `MD —ASSUMES→ Assumption`, `MD —RAISES→ Question`, 4종 모두 `MENTIONS→Term`. **MD→Requirement/Constraint 엣지 없음**(드라이버는 읽되 엣지로 남기지 않음), **MD→MD 엣지 없음**(모듈 의존 = 다른 모듈이 EXPOSES한 IF를 CONSUMES).
- **앵커** (`core/graph/anchors.ts:86-89`): MD ← `IS_REALIZED_BY`; IF ← `EXPOSES` 또는 `CONSUMES`; DS ← `CARRIES`; IT ← `ALLOCATES`(in) **또는** 자기 `TARGETS`(out) — OR. ⇒ TARGETS만 있는 태스크는 그래프상 합법·계획상 오류 → check gap이 아니라 프로세스 게이트(`shall status --json`으로 확인) + 상시 층 불가침.
- **Ready/Done** (`core/arith/task-state.ts`): `done` = VerificationReport의 CLAIMS 목록에 대한 사람의 닫힘(기준 무관 ⇒ 0-AC 태스크는 정의됨: 리포트로 끝나고, 그 아래에 Evidence는 붙일 수 없음 — `color.ts` breachOf의 "빈 aim은 빈 허용"); `ready` = 모든 DEPENDS_ON 선행이 closed ∧ 상향 사슬 all green; 사슬은 **모든** ALLOCATES 부모 + TARGETS + SR 사슬(SC/UC/A/G) + REQ/AC/Constraint를 BFS로 합집합 ⇒ **복수 부모 합집합은 이미 구현, 단일 부모 전제 없음.** IF/DS는 의도적으로 사슬 밖.
- **어디에도 없는 것**: DEPENDS_ON 사이클 검출(허용만 됨), 모듈 의존 사이클, TARGETS 카디널리티(0..n 허용). 카디널리티 선례는 aim rule의 "리포트는 정확히 하나의 태스크를 claim"(`color.ts:~570`).
- **번들** (`core/arith/bundles.ts`): Intent+Plan은 한 "spec" 쪽; 뿌리 = 최상단 yellow; 걸음은 outgoing 엣지를 따르되 소스 자신의 out-anchor는 제외 → SR 파일 편집으로 앵커된 MD는 **SR의 카드**에 실림; 태스크의 TARGETS는 전방으로 걷지 않음; DEPENDS_ON은 걸음; 공유 멤버는 `sharedWith`. Phase 2·3에서 MD 파일이 다시 편집되므로 MD가 다시 yellow가 되어 카드의 뿌리가 됨(specify에서 SR이 phase 5에 다시 오르는 것과 같은 정상 동작).
- **템플릿** (`core/serialize/template.ts` ← `core/graph/guide.ts`): 4종 스타팅 파일 이미 존재. 증분 = 힌트/섹션. `~/.shall/templates`는 데몬 시작 시 바이트 멱등 재생성. 골든 테스트는 Requirement/Term만 고정.
- **check 배관**: `checkSpec`(`daemon/src/service/spec-graph.ts:691`)이 review status의 `orphan|off-target|premature`를 gap으로 냄; 보드 Fix Spec(`core/arith/board.ts` fixOf·RANK), 반려 문(`spec-queue.ts:~147`), 승인 문(`spec-review.ts:~437`), 웹 `NodePanel.tsx` statusCopy switch(default 없음 → 누락 시 tsc 에러)가 같은 이유 단어를 소비. CLI는 `node.problem`을 그대로 출력(변경 불요). 선례: 커밋 `37123c3`(premature).
- **린트** (`scripts/lint-plugin.mjs`): 5자+ 대문자 shout는 엣지 타입 또는 `ALLOWED_SHOUTS`; `--type`은 canon; 코드 안 `shall <word>`는 실제 서브커맨드; guide 힌트 verbatim 복사·`·` 문자 금지(plugin/*.md 전부); `$ARGUMENTS` 검사는 `commands/specify.md`에만 하드코딩.
- **상시 층** = `.claude/rules/shall.md`(`daemon/src/host/agent-rules.ts`의 `RULES`, 프로젝트 열 때 재생성). `.shall/GROUND.md`는 없음(지시서의 GROUND.md = 이 파일). plan 규칙 없음, 마지막 문단은 `/shall:specify`만 가리킴. 테스트 `agent-rules.test.ts`는 정규식 3개만 고정.
- **데모**: demo2 = 포커스 타이머 CLI(본문 한글), 66/66 green, plan/execution 노드 없음, **README/CONTRIBUTING/docs/CLAUDE.md 없음**(→ 시드 필요), 워킹트리에 Term 6개 재승인 흔적(무해). demo3 비어 있음. demo1은 플레이스홀더 plan 노드 보유(수동 저작 스모크용).
- `apps/web/src/spec/view/*` 미커밋 변경(그래프 레이아웃)은 무관 — 건드리지 않음.
- 플랜 밴드 폴더는 첫 plan 노드가 써질 때까지 없으므로 `--scope .shall/spec/plan`은 거절됨(`scopePrefixOf`) → 신규 모드 판별은 `shall status --json` 전체를 `band`로 필터.
- 위성(Assumption)은 모듈에서 ASSUMES해도 `intent` 밴드에 파일됨(`SATELLITE_BAND`).
- Phase 1이 SR 파일에 IS_REALIZED_BY를 쓰면 SR이 yellow(reason `changed`)가 됨 — 진입 게이트가 이를 "미승인 스펙"으로 오인하지 않게 `unapproved`와 구분해야 함.

## 확정된 결정 (사용자 확인 완료 2026-08-19)

1. **태스크 경로**: 기본 불포함(방법 비지정). **사용자가 명시 요청 시에만 허용** — phase-3에서 `Paths?` 질문 1회 후 Deliverables에 기록하고, 터미널 설명에 "요청에 따라 수준 규칙을 완화했다"고 명시.
2. **plan 심은 빨강** — premature와 같은 길: 새 이유 `cyclic`(태스크 DEPENDS_ON 사이클 + 모듈 CONSUMES/EXPOSES 사이클; Requirement DEPENDS_ON도 같은 코드로 포함, CONFLICTS_WITH는 제외) + TARGETS>1은 aim rule의 세 번째 절(`off-target`). check gap·Fix Spec·양 문 거절·웹 패널까지 한 커밋.
3. **템플릿**: 새 헤딩(MD `Hidden Decision`, IF `Invariants`, DS `Validity Rules`) + 기존 헤딩 힌트. DS 헤딩은 Constraint 노드 타입과의 충돌을 피해 `Validity Rules`.
4. **상시 층**: 마지막 문단에 `/shall:plan` 포인터 + 불가침 1개("A task hangs off a module"). 경로 금지 규칙은 스킬에만.
5. 지시서 기본값 유지: Constraint 승격은 `/shall:specify` 수정 모드 왕복(같은 세션); 엣지/frontmatter 표현 발명 없음; 분해+설계 한 phase(웹 승인은 phase 종료마다 1회, 총 3회; 분해 중간 승인은 터미널 전용·파일 없음).
6. Plan 정본은 canon 엣지 이름으로 처음부터 쓴다 → `Shall_Plan_Canon_Mapping.md`는 만들지 않는다(specify 매핑 문서는 그래프 이전에 쓰인 문서를 수리한 것; 수리할 게 없음). 정본이 쓰지 않는 세 단어(DB/등록·필드·"카드 한 장")는 §0 불릿 하나로.
7. shall-plan 스파인은 **자족적**(specify 스파인처럼 2단 승인·질문 규칙을 적응 복사). 이유: 커맨드는 `shall:shall-authoring`→`shall:shall-plan`만 로드하므로 교차 참조는 로드 안 된 스킬을 가리키고, 기본값→Assumption 규칙(plan에서는 MD만 ASSUMES 가능)·카드 표가 다르다. 디스패치 표는 커맨드에만(스파인은 재진술 금지 — specify와 동일).
8. 진입 게이트(서브그래프 국소 all-green)는 **커맨드 Step 2**에 둔다(모든 phase의 전제이므로; phase 파일은 자기 몫만 재진술).

---

## 산출물 & 커밋 순서

각 요소 완료 시 커밋 분리. 미결·설계 이탈은 임의 해결하지 말고 `docs/OPEN_QUESTIONS.md`에 기록 후 질문. 지시서와 원천이 충돌하면 정지·보고.

### WP1 — `docs/Shall_Plan_Process_v1.md` (영어) — 커밋 1

**형식**: specify 정본의 골격 그대로. 제목 + 2줄 블록쿼트(고유명사 없음) → `## Input` → `## Entry Dispatch`(번호 목록) → `## 0. Common Rules (apply to every phase)` → `## 1. Module Design Phase Process` → `## 2. Contract Phase Process` → `## 3. Task Decomposition Phase Process`. 각 phase는 ordered steps + `*` 주의/복귀 불릿 + 마지막 스텝이 dual approval(`Approval gate:` 불릿, `Upon web approval, proceed to Phase N+1.`).

**블록쿼트**(specify와 다른 유일한 구조 이탈, 커밋 본문에 이유 기재): "The agent–human interaction flow that fills the plan plane — module designs, contracts and implementation tasks — on top of a specification a person has approved." / "Written in the graph's own relation names from the first line, so nothing here has to be translated before it is followed. Where this document and the code disagree, the code is right."

**Input**: `/plan <technical direction or change request>`, `$ARGUMENTS` 관례, 빈 입력이면 시작하지 않고 방향을 묻는다.

**Entry Dispatch** (번호):
1. 미승인 plan 작업 우선(plan 밴드 yellow; 위성·"changed" SR도 plan 작업으로 읽는 두 예외 명시). 2. 상류 게이트 — 2.1 지름길(intent 밴드 전부 green ⇒ 통과), 2.2 걸음(대상 SR → 색; 위로 SC/UC/A/G, REFINES; 옆으로 REQ→AC/Constraint, SC→AC; `shall status --json` 한 번의 outgoing 엣지로 조인, `--scope`는 관계를 따르지 않음), 2.3 미충족 시 id를 대며 `/specify`로. 3. 모드: 대상 SR에 `IS_REALIZED_BY` 없음 → new mode(Phase 1), 아니면 revision. 4. (revision) 대응표 — 모듈 경계·할당·내부 설계 → Phase 1 / 모듈이 publish·call하는 것, 경계 넘는 데이터 형태 → Phase 2 / 작업 내용·선행·대상 기준 → Phase 3; 모호하면 상위. 5. (revision) 영향 서브트리 국한, surgical-first, 삭제는 명시 요청 시만, 승인 집합은 변경·추가 노드만. 6. Phase 3은 두 모드 모두 마지막; Phase 2는 공집합 통과 가능.

**§0 Common Rules** (순서대로): Question rule(정본 5, 에이전트 측 인터페이스는 4로 더 좁게 묶임을 한 문장으로) / Default rule(plan에서 ASSUMES는 MD에서만; 계약·태스크의 기본값은 소유 모듈에 걸고, 모듈 없는 기본값은 질문) / Full-resolution / Dual-approval(터미널 설명 → 파일 저작+check 통과 → 웹 카드 승인 → status 확인; 반려는 작업 지시, 개정으로 소멸) / Fix Spec first / **Level rule**(모듈·컴포넌트까지; 클래스·함수·파일·경로 금지 — 사용자가 경로를 명시 요청하면 phase 3에서 1회 확인 후 예외) / **Convention Survey**(3분기: (a) 구속 규범→Constraint 승격 via `/specify` revision, 같은 세션, 참조로만 남기기 불허·이유; (b) 설계 관례→준수+출처 경로를 따른 노드 description에; (c) 충돌→조용히 이기게 하지 않고 질문; 문서 없으면 한 번 말하고 한 번 묻고 진행) / **Grounds duty**(외부 문서·조사가 결정을 만들었으면 그 phase의 터미널 설명에 어떤 결정이 어떤 근거(출처)를 따랐는지) / **Spec gaps are the normal path**(`/specify` revision 왕복 후 떠난 스텝에서 재개) / **No stored backlog**(부모 없는 태스크·스펙 근거 없는 횡단 작업·마무리 phase 금지; 검증 시나리오=AC, e2e 증명=Evidence) / Approval principle / "이 문서가 쓰지 않는 세 단어".

**§1 Module Design** — 13 스텝, 1~10 분해(대화 안에서 초안, 파일 없음), 10 = **분해 중간 승인(터미널 전용, 미승인 시 3으로)**, 11~13 설계+1회 저작:
1 Convention Survey 3분기 처리 / 2 드라이버 수집(scope의 green SR + 비기능 REQ + Constraint; 드라이버는 읽되 엣지 없음 주의) / 3 책임→구조 방향만 / 4 각 후보 모듈의 "숨기는 결정" 답하기(처리 순서 답=재분해 신호; 입력→처리→출력 분해=재분해) / 5 할당 검증 2문(같은 이유로 함께 변하는가, 모듈 간 의존은 계약 경유만 — 계약은 Phase 2 산출이므로 인수인계 지점을 표시만) / 6 갈등=정보 보유 모듈 / 7 순수 기술 모듈 정당 / 8 Term 이중 정의면 정지→분리(`/specify`) 또는 경계 재고, 사용자 확정 / 9 자기 점검(핵심 SR ≥1 MD ∧ 고아 MD 없음 ∧ 모듈 의존 무사이클 ∧ Constraint 위반 없음) / 10 **터미널 분해 승인, 파일 없음** / 11 설계 4항: 11.1 role(한 문장, "and" 불가→3으로; 역할 유형 어휘 6종은 출발점) 11.2 structural(알려진 양식의 변형: 무엇·왜·어디 변형; 컴포넌트까지) 11.3 behavioral(시나리오별 walkthrough: 누가 행동·무엇을 누구에게 요구·무엇을 넘겨받음; **모듈 간 인수인계 표시**; 상태 보유 모듈은 상태·전이·계기) 11.4 rationale(결정/대안/판정 드라이버; 출처·근거 의무 합류) / 12 검증(REALIZED_BY SR 전부 ≥1 워크스루; 모순 시 설계 수정 또는 3으로) / 13 dual approval(터미널 미승인 시 경계·할당→3, 4항→11; IS_REALIZED_BY는 SR 파일에 쓰이므로 SR 재yellow; **Approval gate:** 9 ∧ 4항 전부 ∧ REALIZED_BY SR 전부 워크스루 ∧ 모순 없음; → Phase 2).

**§2 Contracts** — 8 스텝: 1 워크스루에서 수확(인수인계=Interface 의무 원천, 경계 넘는 데이터=DS 후보; 워크스루 없는 계약은 근거 제시) / 2 Interface=의무의 분배(사전/사후/불변; 시그니처 나열 아님) / 3 공개 항목마다 소비자 명시(소비자 없음=과잉 노출→제거 검토; 외부 표면 없는 모듈은 IF 없음) / 4 형식은 모듈 유형에 감응(서비스·CLI·라이브러리·파서), 계약 수준까지 / 5 DS 도출 3문(식별성/값 동등/함께 일관 묶음→한 단위), DE 1:1 복사 아님 / 6 REQ 검증 규칙(형식·범위·필수성)을 스키마 제약으로 / 7 계약 간 정합 대조 / 8 dual approval(반환: 의무→2, 노출→3, 스키마→5; **Approval gate:** 외부 표면 모듈 IF≥1 ∧ 인수인계 전부 소화 ∧ DS 전부 REPRESENTS ∧ 모순 없음; 내부 전용뿐이면 공집합 통과·승인 의식 없음·DS도 없어야 함(CARRIES 앵커); → Phase 3).

**§3 Task Decomposition** — 8 스텝: 1 양방향 커버리지 / 2 걸침 대상이 구조물이면 Phase 1 복귀(거의 모든 모듈에 걸치면 항상 이 신호) / 3 진짜 걸침은 관련 모듈 전부 부모(Ready 합집합이 안전 장치) / 4 품질 4기준(독립·방법 비지정·추적 0..1·크기; 경로 예외는 사용자 명시 요청 시 1회 확인) / 5 순서·라벨 저장 안 함 / 6 AC 커버리지(scope 내 모든 AC ≥1 task; 미커버 AC→닫을 task 도출, 워크스루가 소유 모듈을 말함; 0-AC task 허용, 완료=리포트에 대한 사람의 닫힘, Evidence 불가는 산술의 귀결) / 7 dual approval(반환: 소속→1, 걸침→2, 품질→4, 커버리지→6; **Approval gate:** 양방향 커버리지 ∧ DEPENDS_ON 무사이클 ∧ task→AC ≤1 ∧ 미target AC 없음 ∧ 승인 후 보드 Ready ≥1; 승인 후 보드가 비면 4의 첫 기준 위반) / 8 완료 선언, 이후 변경은 `/plan <change request>` 재진입.

### WP2 — core: 템플릿 힌트/헤딩 (`core/graph/guide.ts`) — 커밋 2

4종 항목 교체(저작 순서). 힌트는 길고 특유하게(린트 (e)가 verbatim 포함을 잡으므로 짧은 관용구 금지):
- ModuleDesign: `Role Description`("one sentence naming the one charge this module answers for") / **`Hidden Decision`**("the one decision this module keeps to itself, so that changing it changes nothing outside") / `Structural Design Description`("components and their arrangement, never classes, functions or files, naming the arrangement it follows and where it departs") / `Behavior Design Description`("walk the scenarios through: who acts, who is asked, what is handed over, and the states and transitions when it holds any") / `Rationale`("what was decided, what else was weighed, and which driver settled it, with the path to the convention when a convention settled it")
- Interface: `Contract Description`("what is promised, and which modules consume it, exposing nothing they do not need") / `Interface Type`(기존 enum 유지) / `Protocol` / `Preconditions`("what the caller guarantees before it calls") / `Postconditions`("what this module guarantees when it returns") / **`Invariants`**("what holds before and after every call, whatever else happens")
- DataSchema: `Description`("what it carries, and why it is a schema of its own: an identity, a value compared whole, or a bundle kept consistent") / **`Validity Rules`**("the format, range and presence rules the requirements already state")
- ImplementationTask: `Description`("what is finished when this is done, never how it is done and never which files it touches") / `Goal` / `Non-Goals` / `Scope`("one turn of work, small enough to finish without stopping") / `Deliverables` / `Definition of Done`("what a verifier reads to agree it is done, which is the targeted criterion when there is one") / `Risks`
- 파일 머리 주석에 "plan 밴드 힌트는 `/shall:plan` 프로세스의 규약을 앉힌 것" 한 문장 추가.
- 골든 수정 없음(serialize.test.ts는 guide에서 재계산). 데몬 `writeTemplatesInto`는 바이트 비교 재생성.
- 검증: `bun run build:core && bun run --filter @shall/core test && bun run typecheck && node scripts/lint-plugin.mjs`(새 힌트가 plugin/에 이미 있는지 확인).

### WP3 — core: aim rule 세 번째 절 — task→AC ≤1 — 커밋 3

`core/arith/color.ts`: `OffTarget` union에 `{ claimant: "task"; taskId; targets }` 추가; `offTargetOf` 첫 분기(WorkLog 분기 앞)에 `node.type === "ImplementationTask"` → `writtenTargetsOf(id, TARGETS)`가 2개 이상이면 breach(한쪽 끝만 — 두 TARGETS 줄이 모두 태스크 자기 파일); `offTargetSentence`에 절 추가:
`${taskId} targets ${listOf(targets)} — a task aims at one criterion at most, because a task with two aims closes neither on its own. Split the task, or remove the TARGETS line this work is not for.`
새 이유 단어·Record 키·소비자 변경 없음. 테스트: `color.test.ts` describe "a task's aim"(2개→red off-target 정확 문장 / 1개·0개는 unapproved / 대롱 두 번째 target도 셈 + `review.missing`에 남음 / 승인된 2-aim 태스크도 red), `board.test.ts`(Fix Spec 행 kind grammar), `daemon spec-graph.test.ts`(gap 1개). `board.test.ts:337`에 chainGreen이 이제 두 이유로 false라는 주석 한 줄.

### WP4 — `cyclic` 심 (core+daemon+web+문서, 분리 불가) — 커밋 4

- **새 파일 `core/arith/plan-seams.ts`**: `planCyclesOf(graph): PlanCycles`(id → `{kind:"depends", type, loop:string[]}` | `{kind:"module", loop: ModuleHop[]}`), `cyclicOf(subject, context)`, `isCyclic`, `cyclicSentence(id, cycle)`. 알고리즘: (1) 인접 두 개를 `graph.edges`에서 한 번 구축 — DEPENDS_ON(양끝 living, 대롱 제외, id 정렬) / 파생 모듈 그래프 A→B(label I) iff A CONSUMES I ∧ B EXPOSES I ∧ 셋 다 living ∧ A≠B(자기 노출 계약 소비는 의존 아님), 다중 IF면 최소 id; (2) 멤버십: 경로 스택을 든 반복 DFS 한 번(선형); (3) 렌더링: 사이클 위 id만, id 정렬 후계자로 BFS 최단 복귀 경로. `color.ts`에서는 type-only import(런타임 순환 없음, task-state.ts 선례).
- **문장**(정확히): 태스크 — `${id} waits on ${chain} — a task cannot wait on itself through others, and no task on this loop can ever be called ready. Remove one DEPENDS_ON line, or split the task both halves need.` / 그 외 DEPENDS_ON(Requirement) — `${id} waits on ${chain} — nothing in a specification waits on itself through others, so neither of these can be the one that comes first. Remove one DEPENDS_ON line, or write the shared part as a third node both depend on.` / 모듈 — `${hops} — a module's dependencies run one way, and a loop means neither module can be built, read or replaced without the other. Remove one CONSUMES line, or move what both need into a module of its own.` (chain = "B, which waits on C, which waits on A"; hops = "MD-0001 consumes IF-0002, which MD-0002 exposes, and …"). Interface는 빨강이 되지 않음. CONFLICTS_WITH는 절대 잡지 않음. REFINES 루프는 OPEN_QUESTIONS로.
- `core/arith/color.ts`: `ColorContext`에 `cycles: PlanCycles`(colorContextOf에서 `planCyclesOf(graph)`), `ColorVerdict` red reason에 `"cyclic"`(off-target 뒤), `colorOf`에 `isOffTarget` 다음 `if (isCyclic(...)) return {red, "cyclic"}`; 주석 갱신(SEVEN→EIGHT 등 `:25,:316,:799`, 헤더에 "왜 사슬 안인가: 파일이 말하는 것을 읽지 사람이 결정한 것을 읽지 않음").
- `core/arith/review.ts`: `problemFor`에 cyclic 분기(`cyclicSentence`), `ReviewStatus.problem` 주석, EIGHTH→NINTH.
- `core/arith/task-state.ts`: `prematureAddressOf`·`depthOf` 주석 갱신(루프는 이제 빨강; 허용은 유지).
- `core/arith/board.ts`: `FixSpecItem["reason"]`에 `"cyclic"`, `RANK.cyclic = 1`, `fixOf`에 arm(kind grammar).
- `core/arith/index.ts`: export.
- `daemon/src/service/spec-graph.ts` checkSpec: reason 조건에 `cyclic` 추가 + 주석(루프 문장은 루프 위 모든 노드 아래 파일됨).
- `daemon/src/service/spec-queue.ts` 반려 문·`spec-review.ts` blockerFor: premature와 같은 꼴의 arm(`… Fix that first; a rejection is a judgement on a node the graph holds together.` / `… Fix that first — there is nothing yet to approve.`). 닫힘 문은 색 gate가 이미 막음(커밋 본문에 명시).
- `apps/web/src/spec/NodePanel.tsx` statusCopy: `case "cyclic"` — title "On a loop", body `status.problem ?? …`.
- `bundles.ts` 변경 없음(cyclic은 orphan/off-target처럼 큐 밖) + 테스트로 고정.
- 테스트: `color.test.ts` describe "a loop in the plan"(상호 대기 두 태스크 각자 시점 문장 / 3개 루프 순서 / 옆 태스크 무영향 / 고아 우선 / 2-aim 우선(순서 고정) / 대롱 선행은 루프 아님 / Requirement 루프 문장 / **CONFLICTS_WITH 양방향은 루프 아님** / 모듈 상호 소비 빨강+IF 이름 / IF는 빨강 아님 / 자기 노출 계약 소비는 루프 아님 / 승인돼도 빨강), `board.test.ts`(Fix Spec 행, 정렬 `["rejected","cyclic","orphan","missing"]`), `bundles.test.ts`(멤버·뿌리 아님), daemon `spec-graph.test.ts`(양쪽 파일 gap), `spec-queue.test.ts`(승인·일괄승인·반려 모두 거절 문장), `spec-board.test.ts`.
- 문서(같은 커밋): `ARCHITECTURE.md:193/204/257`(aim rule 0..1 절, 여덟→아홉 번째 질문, 사슬에 `계획의 순환(cyclic)`+`isCyclic`, 새 불릿), `README.md:~144`(premature 문단 다음에 "the plan may not wait on itself" 문단), `docs/OPEN_QUESTIONS.md`에 `## From the /plan round (2026-08-19)` — (i) Goal REFINES 루프도 잡을지(`plan-seams.ts`), (ii) cyclic 노드를 번들 멤버로 실을지(`bundles.ts isMember`), (iii) RELATES_TO는 대상 아님(설명이지 순서 아님).
- 검증: `bun run build:core && bun run --filter @shall/core test && bun run --filter @shall/daemon test && bun run --filter @shall/web test && bun run --filter @shall/cli test && bun run typecheck && node scripts/lint-plugin.mjs` — **`bun run typecheck`가 NodePanel arm 누락을 잡는 유일한 관문.**

### WP5 — 상시 층 + 린트 — 커밋 5

- `daemon/src/host/agent-rules.ts` `RULES`: `add-spec-node` 문단 뒤에
  `**A task hangs off a module.** Never write an \`ImplementationTask\` no \`ModuleDesign\` \`ALLOCATES\` — a task the criterion alone holds is anchored, so nothing will flag it, and a task with no design behind it is a stored backlog rather than a plan.`
  마지막 문단: `Working on the specification itself? \`/shall:specify\` runs the elicitation and \`/shall:plan\` turns an approved intent into modules, contracts and tasks; the \`shall-authoring\` skill carries the rest, when the Shall plugin is loaded.`
  `agent-rules.test.ts`에 `assert.match(text, /A task hangs off a module/)` 추가, 주석 "three sentences"→"four". 커밋 본문에 "프로젝트 열 때 재생성되므로 기존 프로젝트에 다음 open에 반영" 명시.
- `scripts/lint-plugin.mjs`: 규칙 (d)를 `path.dirname(relative) === "commands"`인 모든 파일로 확장, 문장에 파일명 삽입. `ALLOWED_SHOUTS`는 추가하지 않는 것을 목표(플러그인 산문은 소문자로; `README`만 대문자, `CONTRIBUTING`/`CLAUDE` 등 파일명은 "a contributing guide, the rules file the project loads into every session"처럼 풀어 씀; 정 필요하면 `READY`/`BLOCKED`만 허용).
- 검증: `bun run --filter @shall/daemon test && bun run build:core && node scripts/lint-plugin.mjs && claude plugin validate ./plugin --strict`.

### WP6 — shall-authoring 증분 — 커밋 6

- `plugin/skills/shall-authoring/references/relations.md`: intent 체인 펜스 뒤에 "The plan chain, in canon names" 펜스(`SR ──IS_REALIZED_BY──▶ MD` / `MD ──EXPOSES──▶ IF ──CARRIES──▶ DS ──REPRESENTS──▶ DE` / `MD ──CONSUMES──▶ IF (the contract this module calls)` / `MD ──ALLOCATES──▶ IT ──DEPENDS_ON──▶ IT` / `IT ──TARGETS──▶ AC (written in the task)`) + 두 문장(모듈끼리 잇는 관계 없음 — 의존은 소비/노출; 모듈↔REQ/Constraint 관계 없음 — 드라이버는 읽되 관계 없음). 앵커 표에 Plan 4행 추가, 마지막 문장을 "Read `anchors.ts` before relying on an Execution row"로 좁힘. "Which end owns the line"은 변경 없음.
- `references/examples.md`: 네 번째 워크드 패시지 "A module, its contract and one task" — 기존 꼴(명령 출력·파일·거절 문장·수정): MD 고아 문장(`… held to the graph by an IS_REALIZED_BY relation into it …`), SR-0004에 IS_REALIZED_BY(REQUIRES 앞 정렬), IF + MD의 EXPOSES, DS + IF의 CARRIES + DS 자기 REPRESENTS, IT 자기 DEPENDS_ON/TARGETS + MD의 ALLOCATES(정렬 `ALLOCATES, CONSUMES, EXPOSES, MENTIONS`), 스코프 체크→전체 체크, 무엇이 yellow인지 + "TARGETS만으로도 check는 통과했겠지만 틀렸다"는 문장.
- `SKILL.md` §9에 4불릿: 모듈은 숨기는 결정을 자기 말로 말한다 / 태스크는 무엇이 끝나는지만(경로·파일·클래스·함수 없음 — 사람이 명시 요청한 경우만 예외) / 태스크는 최대 하나의 기준을 겨냥(canon은 여럿을 허용하나 `shall check`는 이제 둘 이상을 red로 냄 — WP3 이후 문장) / 어떤 모듈도 ALLOCATES하지 않는 태스크는 계획이 버린 태스크(고아도 gap도 red도 아님). 스키마 재기술 금지 유지(헤딩·힌트 나열 없음).

### WP7 — `commands/plan.md` + `skills/shall-plan/` — 커밋 7

- **`plugin/commands/plan.md`**: specify.md와 바이트 동일한 부분 — frontmatter 형태(`allowed-tools` 동일: Read/Glob/Grep이 Convention Survey에 필요), `$ARGUMENTS` 머리(빈 입력 시 방향을 묻고 정지), Step 0 게이트 전체(4행 표, 4행째 셀만 `/shall:plan`), Step 1(`shall:shall-authoring` → `shall:shall-plan`, 폴백 경로 2개), 수정 모드 3규칙, Step 3 hand over. **다른 부분 = Step 2**: (a) yellow 우선(plan 밴드 + 두 예외: 모듈이 ASSUMES한 위성은 intent 밴드에 파일됨; `changed`이며 IS_REALIZED_BY를 새로 가진 SR은 이 커맨드 자신의 미승인이고 `unapproved` SR은 `/shall:specify` 몫) → (b) **상류 게이트**(지름길: intent 밴드에 green 아닌 것 없음 ⇒ 통과 / 걸음: 대상 SR → 자기 색 → 위로 DERIVES_RESPONSIBILITY 소스 SC → DETAILS 소스 UC → PERFORMS 소스 A → PURSUED_BY 소스 G → REFINES 소스 G; 옆으로 SR의 REQUIRES REQ → HAS_CRITERION AC·HAS_CONSTRAINT C, SC의 HAS_CRITERION AC; `shall status --json` 한 번의 outgoing 줄로 조인, `--scope`는 관계 못 따름 / 하나라도 green 아니면 id를 대고 `/shall:specify`로 정지 — 이 집합이 Ready 계산 집합과 같으므로) → (c) new mode(대상 SR에 IS_REALIZED_BY 없음; **`--scope .shall/spec/plan` 금지** — 폴더가 없으면 거절됨) → (d) revision 표 3행 + 동률 규칙(상위 우선; 경계 변경은 계약·작업을 다시 자르지만 작업 변경은 경계를 움직이지 않음).
- **`plugin/skills/shall-plan/SKILL.md`**(frontmatter: name `shall-plan`, `allowed-tools: Bash(shall:*)`, `user-invocable: false`, description은 3 phase와 로드하는 커맨드): "This page is the spine." / `## What this is`(모듈 설계 → 계약 → 작업; 한 번에 한 phase; 앵커가 위 phase에서 옴; "이 플레인은 사람이 승인한 스펙 위에 쓰이며 커맨드가 그것을 확인했다") / `## Authoring is delegated`(verbatim) / `## The common rules`(옵션 질문 verbatim; 기본값→Assumption은 MD에서만 ASSUMES로 재작성; 나머지 phase 안에서 해소; 개정 원칙; + plan 고유 5불릿: 조사·근거 의무·수준 규칙(경로 예외 규정 포함)·저장 백로그 없음·스펙 공백은 정상 경로) / `## The two-stage approval`(8 스텝 verbatim + 1단계 아래 "Phase 1은 터미널 yes 두 번, 저작 한 번" 문장 + 반려 소멸 문단) / `## Why the card count varies`(표: Phase 1 = SR 하나당 카드 하나(모듈은 SR 카드 안, 여러 SR을 실현하는 모듈은 각 카드에 shared); Phase 2 = 계약 줄을 얻은 모듈당; Phase 3 = 태스크 줄을 얻은 모듈당(다른 모듈 태스크에 DEPENDS_ON하면 shared로 딸려옴; 겨냥한 기준은 딸려오지 않음) + 두 정정 문단: TARGETS만 있는 태스크는 어떤 모듈 카드에도 없고 **자기 혼자 한 줄짜리 카드**로 옴 — 계획이 버린 태스크의 모습; 앵커 안 된 모듈은 카드가 아예 없음(고아 red는 큐 밖, check와 Fix Spec만 말함); "one or more cards" 문장 verbatim) / `## The canon, for this plane`(process word → canon edge → written-in 표: 모듈 실현=`SR —IS_REALIZED_BY→ MD` SR 파일 / 공개·소비=`MD —EXPOSES/CONSUMES→ IF` MD 파일 / 계약이 나르는 데이터=`IF —CARRIES→ DS` IF 파일 / 스키마의 개념=`DS —REPRESENTS→ DE` DS 파일 / 할당=`MD —ALLOCATES→ IT` MD 파일 / 선행=`IT —DEPENDS_ON→ IT` 대기 태스크 파일 / 대상 기준=`IT —TARGETS→ AC` 태스크 파일 / 기본값=`MD —ASSUMES→ Assumption` / 용어=`MENTIONS` / **없음**: 모듈↔모듈, 모듈↔REQ/Constraint; 결과 3가지: 관계는 떠나는 노드 파일에(예외 = 태스크의 DEPENDS_ON·TARGETS, 기준 파일을 건드리지 않기 위해), 위로 달리는 것 없음(모듈 의존은 계약으로만 서술 가능 — 계약으로 못 쓰는 의존은 내부를 짚는 의존), 드라이버는 그래프에 흔적 없음(근거 의무의 이유; Constraint만이 드라이버인 모듈은 매달 곳이 없어 `/shall:specify`로); Decision AFFECTS·Finding ESCALATES는 이 프로세스가 쓰지 않음) / `## Fix Spec comes first`(verbatim) / `## The phases`(3행 표 + "어디서 들어가는지는 커맨드가 정한다, 표 재진술 금지" verbatim; 스파인 추가: 신규는 1부터, 수정은 진입 phase와 그 아래 전부, Phase 2는 공집합 통과 가능, Phase 3은 항상 마지막) / `## The end`(최종 게이트 표: 양방향 커버리지·미target AC 없음·부모 없는 태스크 없음(`shall status --json`)·보드 Ready ≥1(`shall board --json`); "plan 완료 선언 — 작업은 보드에서 시작한다, 여기서 이름 부른 태스크가 보드에 없으면 사슬을 누군가 아직 안 읽은 것" + 이후 변경은 `/shall:plan <request>` revision).
- **`references/phase-1.md`**(Module design): 골격(`# Phase 1 — …` / 스파인 포인터 / Purpose / What it needs from above(커맨드 게이트가 걸은 것 전부 green; revision은 Fix Spec 먼저·요청이 움직이는 모듈로 국한) / 독트린 4절: `Responsibility first, structure second`(phase-4의 관점 전환 표와 같은 꼴: 입력→처리→출력 자르기 vs "기록된 세션의 저장소") / `What a module hides` / `Every module hangs off a responsibility`(IS_REALIZED_BY만이 앵커; 모듈↔REQ/Constraint 엣지 없음 ⇒ 비기능 REQ·Constraint만이 드라이버인 모듈은 매달 SR이 안 쓰인 것 → `/shall:specify`, 가짜 SR 발명 금지) / `The survey, and what it binds` / Steps 13(1~10 대화 안 초안, 10=첫 터미널 yes·파일 없음, 11~12 설계, 13 유일한 저작) / The questions(`Owner`·`Conflict`·`One term?`·`Where?`·`Technical?`; 기본값은 **모듈 파일**에 ASSUMES — 셋 중 유일하게 둘 곳 있는 phase) / Authoring mechanics(**"This section runs after the second terminal yes."**; 표: MD → SR 파일 → `IS_REALIZED_BY` → 자기 파일은 `ASSUMES`·`MENTIONS`; YAML: `# .shall/spec/intent/SystemResponsibility/SR-0004.md — the responsibility, gaining a module` edges IS_REALIZED_BY MD-0002 / REQUIRES R-0012; 여러 SR 실현 시 각 SR 파일에 한 줄; 고아 모듈은 모듈 파일에서 못 고침) / The gate("SR 하나당 카드 하나" + 표: 고아·미응답 id → `shall check`(앵커 안 된 모듈은 red이며 카드 아님) / red 없음 → `shall board --json` / 핵심 SR ≥1 MD → `shall status --json`(check는 안 냄) / SR 없는 MD 없음 → check(고아) / 모듈 의존 무사이클 → **초안 인수인계에서 당신이 읽음; Phase 2가 계약을 쓰면 `shall check`가 계산** / 숨기는 결정·한 문장 role·양식 명명·REALIZED_BY SR 전부 워크스루·근거·출처 → you read them / 카드 전부 green → status) / When the gate fails(처리 순서를 숨김→3 / and→3 또는 11 / 워크스루 모순→12 그리고 3 / 매달 SR 없음→`/shall:specify` / Term 이중→`/shall:specify` 후 3 / 못 지키는 Constraint→`/shall:specify`, 사람이 결정 / 반려→개정)).
- **`references/phase-2.md`**(Contracts): Purpose / What it needs(모든 MD green — EXPOSES/CONSUMES는 모듈 파일에 쓰임) / 독트린 3절(의무의 분배; 최소 공개 — 소비자 없는 항목·내부 모듈·이 프로젝트가 호출만 하는 계약은 CONSUMES 줄만으로 앵커; 스키마는 개념 복사 아님) / Steps 8 / questions(`Which side`·`Consumer`·`One unit?`·`Definition`; 기본값은 소유 모듈에 걸거나 질문) / Authoring mechanics(표: IF → 모듈 파일(publish 모듈과 call 모듈 각각) → `EXPOSES`/`CONSUMES` → 자기 파일 `CARRIES`·`MENTIONS`; DS → IF 파일 → `CARRIES` → 자기 파일 `REPRESENTS`·`MENTIONS`; YAML: `# .shall/spec/plan/ModuleDesign/MD-0002.md — the module, publishing one contract and calling another` CONSUMES IF-0004 / EXPOSES IF-0003; REPRESENTS는 도메인 밴드를 가리키므로 아무것도 yellow로 만들지 않음) / The gate("계약 줄을 얻은 모듈당 카드 하나" + 표: 외부 표면 모듈 IF≥1(status; 표면 유무는 워크스루에서 당신이) / 인수인계 전부 소화(you) / DS는 IF가 나름(check 고아) / DS REPRESENTS(status; check 안 냄) / 소비자 없는 공개 없음(you) / 모순 없음(you) / 모듈 사이클 없음 → `shall check`(cyclic) / green) + 공집합 문단(내부 전용뿐이면 아무것도 안 쓴다, 카드 만들지 않는다, DS도 있으면 안 됨) / When the gate fails(워크스루 없는 계약→phase 1 11.3 또는 삭제 / 아무도 안 지는 의무→2 / 과잉 노출→3 / 1:1 복사→5 / 이중 정의→7 / 소화 안 된 인수인계→phase 1 / 반려→개정)).
- **`references/phase-3.md`**(Work): Purpose / What it needs(모듈·계약 green, scope 내 AC 전부 green — Ready는 사슬 전체로 계산) / 독트린 4절(`Every task has a module` — 앵커 OR 충돌을 그대로: 아무것도 못 잡고 혼자 카드로 옴; `When work spans modules` — 구조물 먼저, 그 다음 전부 부모; `Aiming` — 0 또는 1, 양방향 커버리지, 0-AC 태스크 아래엔 Evidence 불가·리포트만·완료는 사람의 닫힘; `No order is stored`) / Steps 8 / questions(`Spanning`·`Aim`·`Split`·`Waits?`·`Paths?`(방향이 파일을 요구할 때: "no — a path is found while working (Recommended)" / "yes, name them — say so in the terminal")) / Authoring mechanics(표: IT → 각 부모 모듈 파일 → `ALLOCATES` → 자기 파일 `DEPENDS_ON`·`TARGETS`·`MENTIONS`; YAML: `# .shall/spec/plan/ImplementationTask/IT-0007.md — the task, waiting on one and aiming at one` DEPENDS_ON IT-0004 / TARGETS AC-0031; 둘 다 태스크 자기 줄 — 기준 파일을 건드리면 판정이 yellow로; 걸침 작업은 각 부모 파일에 ALLOCATES) / The gate("태스크 줄을 얻은 모듈당 카드 하나; 다른 모듈 태스크에 대기하면 shared로 딸려옴; 겨냥 기준은 안 딸려옴" + 표: 모듈마다 task≥1(status ALLOCATES) / 태스크마다 ALLOCATES≥1(status로 전 모듈 ALLOCATES 스캔; **check는 안 냄** — OR 앵커; 혼자 카드로 옴) / DEPENDS_ON 무사이클 → `shall check`(cyclic) / TARGETS ≤1 → `shall check`(off-target) / scope 내 AC 전부 겨냥(status 조인) / 경로·파일·클래스·함수 없음(you; 사람이 요청한 예외는 터미널에 말함) / 시작 가능한 것 있음 → `shall board --json` Implement ≥1 / green) / When the gate fails(거의 모든 모듈에 걸침→phase 1 / 모듈 없는 태스크→소유 모듈에 줄, 없으면 phase 1 / 겨냥 없는 AC→6 / 판정 불가 AC→`/shall:specify` / 한 회전에 못 끝냄→4 / 승인 후 보드 빔→4 / 반려→개정)).
- 린트 준수: `·` 금지, guide 힌트 verbatim 금지(WP2 힌트를 그대로 옮기지 말 것 — 특히 "one turn of work" 류 짧은 구), 코드 스팬에 `` `shall plan` `` 금지(`/shall:plan`로), 대문자 shout 금지(엣지 이름 외).
- 검증: `bun run build:core && node scripts/lint-plugin.mjs && claude plugin validate ./plugin --strict`.

### WP8 — 플러그인 README/manifest — 커밋 8

- `plugin/README.md`: "It adds two commands"; What it needs에 `/shall:plan`은 상류 green 스펙을 요구하고 아니면 id를 대며 거절; 표에 `commands/plan.md`·`skills/shall-plan/` 행; "Not yet"을 실행 플레인(저널·워크로그·증거·검증 리포트)으로 재작성.
- `plugin/.claude-plugin/plugin.json`: version 0.1.0→0.2.0, description에 plan 절, keywords에 `design`, `planning`. 커맨드/스킬 등록 불필요(디렉터리 관례).

### WP9 — 도그푸딩 + `docs/plan-dogfood.md` — 커밋 9(+수정 커밋들)

- **사전 준비**(demo2 repo에 커밋): `README.md` 3문장(하나의 CLI 바이너리; 세션은 홈 아래 평문 파일에 기록; **네트워크 호출 없음** ← 구속 규범→Constraint 승격 대상) / `CONTRIBUTING.md` 2문장(사용자 출력은 stdout·진단은 stderr ← 설계 관례 인용 대상; **서드파티 런타임 의존성 없음** ← 충돌 대상). 실행 방향: `/shall:plan store sessions in a local database and add a command that prints today's summary`(평문 관례·무의존 관례와 동시에 충돌 → 질문해야 함).
- **`docs/plan-dogfood.md`**: specify-dogfood.md와 같은 골격(전제 "structure replaces judgement", **Haiku 의도적**, 프로토콜 실패(패키지 결함, 수정) vs 얇은 내용(기록만)). plan용 프로토콜 실패 목록: 터미널 yes 전 파일 저작 / Phase 1 카드 yellow인 채 Phase 2 / 모듈 없는 태스크 / 태스크에 경로·클래스(사용자 요청 없이) / 조사 생략 / yellow SR 위에 계획 / 모듈끼리 관계 발명 / `--scope`로 plan 밴드 요청 / 색·Ready를 스스로 계산.
- **Round 1 스모크**(`claude -p --model haiku --plugin-dir ./plugin`): 빈 인수(묻고 정지) / SR 하나를 손으로 yellow(`changed`)로 만들고 실행(id를 대고 거절, `/shall:specify` 안내) / demo1에서 "모듈·인터페이스·태스크를 authoring 스킬대로 손으로 추가"(SR 파일에 IS_REALIZED_BY, check 0) / plan 노드 없는 프로젝트에서 실행(new mode·phase 1·`--scope plan` 안 씀). 훅은 plan 밴드 파일에도 그대로 발화(변경 없음)를 확인.
- **Round 2 전주행**(demo2, 사용자 터미널): Phase 1(분해 터미널 승인 → 설계 → 웹 승인) → Phase 2 → Phase 3, phase마다 웹 승인 왕복; **계약 카드 반려 1회**(rationale → `shall board`로 수신 → 개정 → 자동 소멸 → 재승인); **수정 모드 1회**("change what module X publishes" → Phase 2 진입 판별·서브트리 국한·revise-never-replace); 종료 시 `shall board --json` Implement ≥1 확인. 기록: phase별 카드 수 vs 스파인 예측, shared 멤버가 두 카드에 실리는지, 보드 Ready, `changed` SR을 `unapproved`와 구분했는지, 조사 3분기가 각각 발화했는지(Constraint 승격 왕복 포함).
- 관찰은 2분법으로 기록, 프로토콜 실패는 수정 커밋 분리, 문구 후보는 기록만.

---

## 검증 (end-to-end)

1. 코드: `bun run test`(= build:core + 전 워크스페이스 test + lint-plugin) 와 `bun run typecheck`(웹 NodePanel switch 누락은 여기서만 잡힘) 모두 0.
2. 플러그인: `claude plugin validate ./plugin --strict`, `node scripts/lint-plugin.mjs`(core dist 최신 상태에서).
3. 템플릿: 데몬 재시작 후 `~/.shall/templates/ModuleDesign.md`에 `## Hidden Decision`, `Interface.md`에 `## Invariants`, `DataSchema.md`에 `## Validity Rules`; `shall add-spec-node --type ImplementationTask`의 Description 힌트 확인.
4. 심: 임시 프로젝트에서 IT-0001↔IT-0002 DEPENDS_ON 상호 → `shall check` exit 1·두 파일 아래 문장, `shall board` Fix Spec 두 행, 웹에서 승인 거절; TARGETS 2개 → off-target 문장; MD 상호 소비 → 모듈만 red.
5. 도그푸딩 Round 1·2(위 WP9), 결과를 `docs/plan-dogfood.md`에 기록.

## 리스크·미결(OPEN_QUESTIONS 후보)

- 웹 `tsc -b`만이 reason 누락을 잡음(`--filter @shall/web test`는 view 테스트만). `RANK`는 손으로 쓴 union이라 `FixSpecItem["reason"]`에도 넣어야 컴파일러가 강제.
- 린트 규칙 (e): WP2 힌트가 곧 plugin/*.md 금지 구문 — 힌트를 길고 특유하게 유지, WP2 뒤와 WP7 뒤에 린트 재실행.
- `planCyclesOf`는 반드시 그래프당 한 번의 선형 패스(노드마다 걷지 말 것) — 매 read마다 colorContextOf가 호출됨.
- 모듈 사이클은 Phase 1 시점에는 그래프에 없음(계약 전) → phase-1 게이트는 "당신이 읽음", Phase 2 이후 check가 계산.
- Convention Survey가 읽는 문서 이름은 산문에서 소문자로 풀어 써야 shout 린트를 안 건드림(`README`만 허용됨).
- OPEN_QUESTIONS 추가 후보: Goal REFINES 루프; cyclic의 번들 멤버십; TARGETS-only 태스크를 check note로 낼지(앵커 OR 규칙과 충돌하므로 이번엔 프로세스 게이트+상시 층으로만); Requirement DEPENDS_ON 루프를 이번 심이 함께 잡음(의도적).
