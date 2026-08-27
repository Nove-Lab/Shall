# Shall 에이전트 커맨드의 Spec-Driven Development 적대적 감사

> 감사일: 2026-08-27  
> 범위: `agents/core/entries`, `agents/core/skills`, Claude/Codex 프로필과 훅, Work Board·readiness·closure 산술 및 관련 테스트  
> 기준: README가 선언한 “승인된 스펙을 control plane으로 삼고, 프로젝트 컨텍스트를 유지하며, 국소적인 한 사이클씩 구현한다”는 방향

## 결론

Shall의 스펙 모델은 좋은 spec-driven development 기반이다. 그러나 현재 에이전트 커맨드는 “컨텍스트를 유지하며 한 사이클씩 안전하게 구현한다”는 보장을 아직 충족하지 못한다.

| 영역 | 판정 |
|---|---|
| 스펙 구조·승인 모델 | 강함 |
| 작업 readiness 산술 | 강함 |
| 국소 작업 단위 설계 | 방향은 좋으나 자연어 판단에 의존 |
| 세션 간 컨텍스트 보존 | 취약 |
| 중복 작업 방지 | 결함 있음 |
| Codex 기계적 가드 | 현재 플랫폼 역량보다 뒤처짐 |
| 실전 신뢰도 | 아직 미검증 |

README의 “Agents always know the blast radius of their work”라는 약속은 현재 구현으로는 아직 제품 보장이라 보기 어렵다. 근거가 되는 방향성은 [README의 Principles와 제품 약속](../README.md#-principles-shall-stands-on)에 잘 드러나 있지만, 아래 실행 경로들이 이를 깨뜨릴 수 있다.

## 치명적인 공격 경로

### P0-1. 같은 WorkItem을 연속으로 중복 구현할 수 있다

보드 산술은 완료 보고서가 사람의 판단을 기다리는 동안에도 WorkItem을 계속 `ready`로 둔다. 이 동작은 [board 테스트](../core/arith/board.test.ts)에 “a work item waiting on a person is on the board and in the queue at once”라는 이름으로 명시되어 있다.

동시에 [`/work` entry](../agents/core/entries/work.md)는 이전 턴의 yellow 실행 기록을 이 실행의 일로 취급하지 말라고 지시한다.

공격 흐름은 다음과 같다.

```text
WI-0001 ready
→ 첫 번째 /work가 구현하고 CompletionReport 작성
→ 보고서는 Review Queue에서 대기
→ 보드는 WI-0001을 여전히 ready로 반환
→ 두 번째 /work --auto가 yellow 실행 기록을 무시
→ WI-0001을 다시 집어 중복 구현
```

[`ImplementItem.addressedBy`](../core/arith/board.ts)는 이전 작업 정보를 이미 제공하지만, 선택 규칙은 이를 배제 조건으로 쓰지 않는다.

권장 조치:

- WorkItem 상태를 `blocked / ready / in_review / done`으로 확장한다.
- yellow WorkLog가 있거나 승인된 CompletionReport가 closure를 기다리는 항목은 Implement 목록에서 제외한다.
- 거절된 기록은 새 구현 후보가 아니라 correction/Fix Spec 경로로 보낸다.
- 산술을 바꾸기 전의 단기 방어로 `/work`가 `addressedBy`의 yellow/green 기록을 가진 항목을 자동으로 건너뛰게 한다.

### P0-2. 새 lookback이 중요한 Decision을 놓친다

현재 변경 중인 [`lookback.md`](../agents/core/skills/shall-work/references/lookback.md)는 올바른 방향이다. 그러나 읽는 Decision을 “이전 WorkLog가 기록한 Finding을 `RESOLVES`하는 Decision”으로 한정한다.

Shall의 Decision은 Finding 없이도 Module, WorkItem, Requirement, AcceptanceCriterion 등에 직접 `AFFECTS`할 수 있다. 특히 `/plan`의 프로젝트 기술 결정은 Module을 직접 `AFFECTS`한다. 이 관계는 [`shall-authoring`의 relation 정의](../agents/core/skills/shall-authoring/references/relations.md)에 명시되어 있다.

따라서 현재 lookback은 다음을 놓칠 수 있다.

- 프로젝트 전체 기술 결정
- 특정 WorkItem에 직접 적용된 사용자 결정
- Requirement 또는 AcceptanceCriterion에 영향을 준 결정
- Finding 없이 `/raise`로 기록된 결정

권장 조치:

- 후보 WorkItem의 전체 spec reach에서 들어오는 `AFFECTS`를 역방향으로 걷는다.
- WorkItem, Module, Interface, Requirement, Criterion에 직접 영향을 주는 모든 Decision을 연다.
- `/work.report`도 커밋을 WorkItem에 매핑한 뒤 같은 lookback을 수행한다.

### P0-3. Fix Spec이 스펙의 영향 전파 절차를 우회한다

`/specify`와 `/plan`은 revision 시 영향 범위를 걷고 관련 계층을 다시 검토한다. 반면 [`lookback.md`](../agents/core/skills/shall-work/references/lookback.md)는 Fix Spec에 lookback이 없으며 보드의 rationale이 작업의 전부라고 규정한다.

이 때문에 거절된 Goal이나 Module도 일반적인 국소 파일 수정처럼 처리할 수 있다.

```text
Goal 변경 거절
→ /work가 rationale만 보고 Goal 직접 수정
→ 사람 승인
→ 기존 Scenario/Requirement/WorkItem은 그대로 green
→ 의미상 오래된 하위 스펙 위에서 작업 재개
```

권장 조치:

- 문법·고아 관계 오류만 `/work`에서 국소 수정한다.
- domain/intent 거절은 `/specify` revision으로 보낸다.
- plan 거절은 `/plan` revision으로 보낸다.
- execution record 거절은 해당 journal의 correction 절차로 보낸다.
- 상위 노드 변경에는 반드시 blast-radius walk와 하위 재검토를 적용한다.

## 높은 우선순위의 구조적 위험

### P1-1. 중단 후 복구가 커밋되지 않은 작업을 안정적으로 복원하지 못한다

[`agents/README.md`](../agents/README.md#not-yet)는 턴이 중단되면 git밖에 남지 않는다고 명시한다. [`report.md`](../agents/core/skills/shall-work/references/report.md)의 주 복원 경로는 마지막 Journal 이후의 `git log`다.

다음 정보는 안정적으로 복원되지 않는다.

- staged/unstaged 변경
- untracked 파일
- 시작 전부터 존재하던 사용자 변경
- 어느 WorkItem을 위해 바꾼 파일인지
- 작업 중 합의했지만 커밋되지 않은 접근법
- 세션 compaction으로 사라진 항목별 노트

권장 조치:

stop 1에서 다음을 가진 durable turn checkpoint를 만든다.

- turn id와 선택한 WorkItem ids
- 시작 HEAD
- 시작 당시 dirty paths
- WorkItem, Definition of Done, Criterion의 content hash
- 항목별 접근법과 진행 상태

이것은 승인 기록이나 spec node가 아니라 `.shall/runtime/` 또는 daemon이 관리하는 명시적인 ephemeral 상태로 두고 resume/abandon을 지원하는 편이 적합하다. `/work.report`는 `git log`뿐 아니라 staged, unstaged, untracked 상태와 checkpoint baseline을 함께 읽어야 한다.

### P1-2. “최대 3개”는 국소성 보장이 아니다

[`work-items.md`](../agents/core/skills/shall-plan/references/work-items.md)는 WorkItem을 “한 턴 크기”로 잘 정의한다. 그러나 이것은 사람이 읽는 자연어 gate뿐이다. `/work`에는 oversized item을 구현 전에 다시 쪼개는 preflight가 없고, 그런 항목을 세 개까지 묶을 수 있다.

stop 1 전에 다음을 판단해야 한다.

- 하나의 coherent하고 독립적으로 검증 가능한 slice인가
- 예상 변경이 하나의 모듈 경계를 중심으로 모이는가
- 현재 턴 안에 전체 Definition of Done을 관찰할 수 있는가
- 그렇지 않다면 `/plan` revision으로 돌아가 split해야 하는가

기본값은 한 항목으로 두고, 두세 항목은 같은 계약이나 vertical slice를 함께 완성할 때만 묶는 편이 안전하다.

### P1-3. lookback은 큰 프로젝트에서 컨텍스트 폭발을 일으킨다

현재 lookback은 모든 sibling WorkItem, 관련 WorkLog, Finding, Decision, CompletionReport와 최근 Journal을 읽는다. 성숙한 Module에서는 국소 컨텍스트 유지가 아니라 과거 전체 재적재가 된다. 또한 “가장 큰 Journal id가 가장 최신 턴”이라는 가정은 브랜치 병합이나 가져오기 환경에서 약하다.

권장 조치:

`shall context --work-item WI-… --json`과 같은 bounded projection을 제공한다.

- 모든 직접 `AFFECTS` Decision
- unresolved 또는 blocking Finding
- 각 sibling의 최신 승인 결과
- 해당 항목의 미완료/거절 로그
- 실제 timestamp 또는 commit chronology 기준 최근 턴
- 제한을 넘으면 요약과 생략 개수

### P1-4. Codex의 기계적 가드 전제가 낡았다

현재 [`Codex profile`](../agents/profiles/codex/profile.mjs)과 [`Codex adapter`](../daemon/src/host/adapters/codex.ts)는 ledger 보호가 문장뿐이고 per-path deny를 만들 수 없다는 전제에 서 있다. 현재 wiring도 [`PostToolUse`의 spec check](../agents/profiles/codex/static/hooks/hooks.json)만 설치한다.

그러나 현재 공식 OpenAI 문서에 따르면 Codex hooks는 `PreToolUse`에서 Bash, `apply_patch`, Write/Edit 등을 관찰하고 실행 전에 차단할 수 있다. 따라서 최소한 다음은 기계적으로 막을 수 있다.

- `.shall/ledger/**` 쓰기
- `.shall/spec/**` 실제 삭제
- 허용되지 않은 spec write 경로

참고: [OpenAI Hooks 문서](https://learn.chatgpt.com/docs/hooks)

또한 [`writeAgentsMdBlock`](../daemon/src/host/agents-md.ts)은 기존 `AGENTS.md`의 뒤에 Shall 블록을 붙인다. Codex는 기본적으로 결합된 프로젝트 지침을 32KiB까지만 읽으므로, 큰 기존 `AGENTS.md`에서는 뒤쪽의 Shall 블록이 잘릴 수 있다.

권장 조치:

- Codex adapter가 `PreToolUse`와 `PostToolUse`를 일반적으로 병합할 수 있게 한다.
- ledger write와 spec deletion을 차단하는 pre-hook을 추가한다.
- `shall init`과 refresh에서 `AGENTS.md` 크기 및 실제 로딩 가능성을 검사하고 경고한다.
- 설치 확인 명령이 활성 instruction source와 skill discovery를 검증하게 한다.

참고: [OpenAI AGENTS.md 문서](https://learn.chatgpt.com/docs/agent-configuration/agents-md)

한편 `.agents/skills` 배치와 progressive disclosure 방식은 현재 공식 스킬 규격과 일치한다.

참고: [OpenAI Build skills 문서](https://learn.chatgpt.com/docs/build-skills)

## 잘 설계된 부분

- 승인된 상위 spec과 prerequisite closure를 함께 읽는 readiness 산술
- 독립적이고 관찰 가능한 WorkItem과 Definition of Done 설계
- Requirement, AcceptanceCriterion, Evidence를 분리한 구조
- 사람이 approve, reject, close를 독점하는 권한 모델
- 승인된 execution record의 append-only 성격
- spec write 직후 `shall check`를 실행하는 hook
- agent-neutral core와 Claude/Codex profile의 분리
- 생성물의 링크, relation, command 이름을 검사하는 prose lint

구조적 기반을 갈아엎을 필요는 없다. 문제는 실행 오케스트레이션의 마지막 구간이다.

## 권장 수정 순서

1. WorkItem에 `in_review` 상태를 파생하고 중복 pick을 차단한다.
2. lookback에 모든 직접 `AFFECTS` Decision을 포함한다.
3. Fix Spec을 node type과 reason에 따라 담당 프로세스로 라우팅한다.
4. durable turn checkpoint와 dirty-worktree baseline을 도입한다.
5. oversized WorkItem split preflight를 추가한다.
6. unbounded lookback을 daemon의 bounded context projection으로 교체한다.
7. Codex `PreToolUse` 안전 가드와 `AGENTS.md` 크기 검증을 추가한다.
8. 실제 약한 모델을 사용한 adversarial end-to-end eval을 실행한다.

## 검증 상태

감사 중 다음을 확인했다.

- `node scripts/lint-agents.mjs`: 통과
- board, closure, bundles, agent kit, Codex adapter, AGENTS block 관련 테스트: 153개 통과, 실패 0
- 생성된 Claude/Codex tree에 새 lookback reference가 존재함
- 감사 시점의 Shall 저장소 자체에는 `.shall/` 프로젝트가 없어 현재 제품을 이 저장소에서 end-to-end dogfood한 증거는 없음

테스트는 산술과 배포 구조를 잘 검증하지만, 위의 프로세스 조합 실패는 검증하지 않는다. [`agents/README.md`의 Not yet](../agents/README.md#not-yet)도 `/work`, 새 `/plan`, `/help`가 아직 dogfood되지 않았다고 명시한다.

## 최종 판정

Shall은 좋은 SDD 설계를 갖고 있지만 현재 `/work`를 자율적으로 반복 실행하기에는 아직 위험하다. 특히 다음 세 가지를 해결하기 전에는 “항상 승인된 스펙을 따라 국소적으로 한 사이클씩 구현한다”는 문장을 제품 보장으로 사용하기 어렵다.

1. review 중인 WorkItem의 중복 선택 방지
2. 직접 `AFFECTS` Decision을 포함한 완전한 컨텍스트 복원
3. Fix Spec 변경의 영향 범위 전파

이 셋이 해결되면 나머지는 내구성과 규모 확장의 문제다. 해결되지 않으면 현재 강한 그래프와 승인 모델 위에서도 실행 에이전트가 중복 작업하거나, 사용자의 결정을 놓치거나, 상위 스펙 변경 뒤의 오래된 하위 계획을 그대로 구현할 수 있다.
