# Shall — Refactoring: Question 제거 · Decision 재배선 · ESCALATES 은퇴

현재 구현 상태를 먼저 스스로 파악한 뒤, 아래 **목표 상태**에 맞도록 정합시킨다.
목표 상태와 다른 현재 구현은 모두 수정 대상이다. 아래에 없는 동작은 바꾸지 않는다.

**적용 범위는 프로젝트 전 영역이다** — 스키마 정의, 로더/파서, 검증 정책, 색·게이트 술어, CLI(`add-spec-node`·`check`·`status`·`board`), 웹 UI(spec plane·리뷰 큐·task board·메타모델 팝업), **스킬·커맨드 파일 전부**(`.claude/commands/`·플러그인·SKILL.md류 — 본문 프롬프트 안의 노드 타입 언급, 절차 서술, 예시까지), 어댑터 생성 템플릿(데몬이 재생성하는 커맨드·설정의 원본), 표시 문구, 코드 주석, 내부 문서까지. 구 개념(Question, ESCALATES, VerificationReport)의 흔적이 어느 계층에도 남지 않아야 하며, 파악 단계에서 전 영역을 grep으로 훑어 수정 대상 목록을 먼저 만들고 시작한다. 스킬·커맨드는 산문 프롬프트라 grep에 안 걸리는 우회 표현(예: "질문 노드를 남긴다", "검증 리포트를 작성한다" 같은 한국어/영어 서술)이 있을 수 있으니, 문자열 검색 후 각 파일을 처음부터 끝까지 한 번씩 정독해 의미 수준까지 정합시킨다.

## 목표 상태

### 1. 노드 타입

- **Question: 완전 삭제.** 어느 층에도 존재하지 않는다 (intent 포함).
  - 노드 타입 정의·스키마·`add-spec-node` 타입 목록·문서 로더에서 제거.
  - 근거: 미결은 사람-에이전트의 터미널 대화가 그 자리에서 소화한다. 노드로 이월하지 않는다.
- **Decision: plan 층에 거주.** 폴더 `.shall/spec/plan/decision/`, ID 접두 `D`.
  - 역할: 스펙 개정의 rationale 정본 — Finding에 대한 응답 결정과 자발적 개정 결정 모두.
  - 저작 주체 제한 없음 — 다른 노드와 동일하게, 사람과의 대화를 거쳐 에이전트가 파일을 써도 된다. 결정의 확정은 저작이 아니라 **승인**이 담당한다 (yellow → 사람의 웹 승인 → green — 전 노드 공통 규칙 그대로, Decision 특례 없음).
  - domain·intent에 별도 Decision 타입을 만들지 않으며, 독립 decision 레이어도 만들지 않는다 — 거주는 plan 하나, 팔(AFFECTS)은 전 층.
- **Finding: execution 층의 유일한 상향 노드.**
  - `blocking` 속성(boolean) 추가 — true면 해당 발견이 작업을 차단 중임을 뜻한다.
  - 에이전트가 저작한다 (실행 층 규약 그대로).

### 1-b. 노드 개명

- **VerificationReport → TaskCompletionReport**: implementation task의 완료를 주장·서술하는 노드. ID 접두 `TCR`.
  - 타입 정의·스키마·`add-spec-node`·로더·리뷰 큐 카드의 하위 목록·모든 표시 문구까지 일괄 개명.
- **Evidence: 존치 — 개명하지 않는다.** AC 충족의 입증 노드. 입증 수단은 테스트에 한정되지 않는다 (해당 AC의 evaluation_process가 정의하는 바를 따른다).

### 2. 엣지

- **ESCALATES: 완전 은퇴.** 엣지 카탈로그·검증·구현에서 제거한다.
  - Finding은 어떤 노드도 공식 엣지로 가리키지 않는다.
  - 대체: Finding frontmatter에 선택적 힌트 필드 `relatedNodes` (노드 ID 목록) —
    참조 무결성 검증 대상이 아니다 (dangling이어도, 비어 있어도 오류 아님). 표시·탐색 보조용.
- **RESOLVES: 대상 교체.** Decision → Finding. 카디널리티 **0..N**.
  - 의미: "이 결정은 이 발견(들)에 대한 응답이다."
  - 0개 허용 — 자발적 개정(사용자의 변심)도 정당한 Decision이다. N개 허용 — 여러 발견을 한 결정으로 일괄 응답할 수 있다.
  - 방향 근거: 나중에 태어나는 노드(Decision)가 먼저 있는 노드(Finding)를 가리킨다 —
    Finding 파일을 사후 수정하지 않기 위함 (파생 수정 금지).
- **AFFECTS: 유지.** Decision → 살아있는 층(domain/intent/plan)의 **전 타입** — Term·DomainEntity·자기 층의 ModuleDesign 등 포함. 카디널리티 **1..N** — 아무것도 개정시키지 않는 결정은 결정이 아니다.
  - 의미: "이 결정이 이 노드들의 개정을 일으킨다."
- **리뷰 번들 계층 스캔에서 Decision의 서열: 최상단 (Goal 위).** 거주 층(plan)과 무관하다 — D가 yellow 뿌리일 때 그 AFFECTS 파급 전체(Goal·Term 개정 포함)가 한 번들로 잡혀야 하므로. 거주(폴더 위치)와 서열(번들 계산 순서)은 별개 축이다.

### 3. 흐름 (참조 — 이 흐름이 성립해야 한다)

```
에이전트, 실행 중 스펙 결함·괴리 발견
  → Finding 저작 (blocking 속성, relatedNodes 힌트)
  → blocking이면 작업 중단, 아니면 계속

사람, Finding 확인 후 결정
  → Decision 저작 (RESOLVES → Finding, AFFECTS → 개정 대상들)
  → 대상 노드 수정 (yellow) → 리뷰 큐 → 재승인

Finding의 종결 판정 (계산 — 저장하지 않음)
  → 그 Finding을 RESOLVES로 가리키는 Decision이 존재하면 "응답됨"
  → 없으면 "미응답"
```

### 4. 게이트 산식 정리

- 기존 "open Question이 게이트를 잠근다" 류의 산식을 **제거한다** (Question 삭제의 귀결).
- **Finding·Decision은 어떤 기술적 잠금도 하지 않는다** — task board의 표시 조건, 게이트 통과 판정, Implement 성립 조건 어디에도 Finding·Decision을 입력으로 넣지 않는다.
  - blocking 속성은 잠금 플래그가 아니라 **표시·안내용 신호**다: 리뷰 큐·status에서 미응답 blocking Finding을 우선 노출하는 정렬 재료까지만.
  - 발견에 어떻게 대응할지(작업을 멈출지, 계속할지)는 스킬·프로세스 계층에서 안내로 다룬다 — 추후 스킬 설계에서 개정. 지금 스키마·판정 계층에 강제를 넣지 않는다.

### 5. 파장 정리 (누락 없이)

- 검증 정책: Question 관련 조항 제거, ESCALATES 관련 조항 제거, Finding blocking 검사 추가.
- 색 체계: 변경 없음 — Decision·Finding 모두 기존 R/Y/G 규칙 그대로 (등록 승인 축).
- 메타모델 팝업: 구현 방식을 스스로 확인하고, 갱신된 스키마(Question 제거, ESCALATES 제거, RESOLVES·AFFECTS 변경, Decision의 plan 거주, TaskCompletionReport 개명)가 팝업에 정확히 반영되도록 한다. 작업 완료 후 팝업을 실제로 열어 확인할 것.
- `add-spec-node`: Question 옵션 제거. Decision은 plan 층 타입으로 생성되는지 확인.
- 기존 프로젝트에 Question 노드·ESCALATES 엣지가 이미 존재하는 경우의 처리:
  로더가 알 수 없는 타입/엣지로 red(스키마 위반) 처리하면 충분하다 — 자동 마이그레이션·삭제를 구현하지 않는다
  (사용자가 보고 정리하도록 둔다).

## 완료 기준

- Question 타입으로 노드를 만들 수 있는 경로가 없다 (CLI·웹·스키마 전부).
- Finding은 blocking 속성을 갖고, 어떤 공식 엣지도 출발시키지 않는다.
- Decision이 plan 층에 거주하며(폴더·팝업·add-spec-node 일치), RESOLVES(→Finding 0..N)·AFFECTS(→살아있는 층 1..N)가 검증을 통과한다.
- Finding·Decision이 task board·게이트·Implement 판정의 입력으로 쓰이는 코드가 없다 (blocking은 표시·정렬 재료까지만).
- 메타모델 팝업이 갱신된 스키마와 일치함을 실제 열어서 확인했다.
- ESCALATES·VerificationReport라는 문자열이 코드·스키마·문서 어디에도 남아 있지 않다.
- 스킬·커맨드 파일 전부를 정독해 구 개념의 우회 표현(서술문 수준)까지 제거·교체했음을 파일 목록과 함께 보고한다.
- TaskCompletionReport(TCR 접두)로 노드 생성·로드·리뷰 큐 표시가 정상 동작한다.
