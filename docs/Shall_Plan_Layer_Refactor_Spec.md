# Shall — Plan 층 리팩토링: Module · WorkItem 재정의와 구체성 회복

## 0. 문제

현재 plan 층의 산출물이 계획으로서 기능하지 못한다. 증상은 **"Shall-Demo/demo1" 프로젝트의 plan 레이어 노드들에서 직접 확인할 수 있다** — 작업 시작 전에 반드시 읽어볼 것:

- **기술 결정이 전혀 없다.** 어떤 모듈이 무슨 런타임·언어·저장소·라이브러리 위에 서는지 어디에도 안 적혀 있다 — 파이썬 스크립트인지 서버 모듈인지 브라우저 앱인지조차 노드만 봐서는 알 수 없다.
- **구체 기술이 은유로 대체돼 있다.** "시각 표지", "기록 저장소", "박동마다", "덧붙이는 자리" 같은 문학적 서술이 timestamp·localStorage·polling interval·append API가 있어야 할 자리를 차지하고 있다. 읽는 사람이 실체를 역산해야 한다.
- **implementation task가 착수 가능한 작업 지시가 아니다.** 대상 파일도, 만들 것의 기술적 실체도, 검증 방법의 구체도 없어 — 이 노드를 받아 든 에이전트는 결국 처음부터 다시 계획해야 하고, 그 재계획은 어디에도 기록되지 않는다.
- **전반적으로 "계획하는 지능"이 발휘되지 않았다.** 같은 에이전트가 네이티브 플랜 모드에서 내는 계획(리포 탐색 → 대안 검토 → 파일 수준 접근)보다 질이 낮다 — 스킬이 "이 양식을 채워라"를 묻고 있어서, 에이전트의 에너지가 계획이 아니라 템플릿 준수에 쓰였다.

원인은 세 겹이다: (1) "코드 상세는 repo에" 규율이 "기술을 결정하지 마라"로 오독되어 전 층이 Intent 수준 추상도로 평탄화됨, (2) 기술 결정이 앉을 자리가 스키마에 없음 — Intent는 승격 금지, Design은 "구조만", task는 Design을 따르니 결정이 일어날 곳이 없다, (3) 절이 많은 템플릿과 은유적 예시문이 채우기로 사고를 대체시키고 문체를 번식시킴.

아래 목표 상태로 스키마·템플릿·스킬·기존 표시를 정합시킨다.

현재 구현을 먼저 스스로 파악하고 시작한다. 적용 범위는 전 영역이다 — 스키마·로더·검증·CLI·웹 UI(보드·배지·메타모델 팝업)·스킬/커맨드 파일(산문 서술 포함 — grep 후 정독)·템플릿(`add-spec-node` 골격)·표시 문구. 구 어휘가 어느 계층에도 남지 않아야 한다.

## 1. 개명

| 구 | 신 | ID 접두 |
|---|---|---|
| ModuleDesign | **Module** | `M` |
| implementation task (Task) | **WorkItem** | `WI` |
| TaskCompletionReport | **CompletionReport** | `CR` |

- 개명 근거를 코드 주석·문서에 남길 필요는 없다 — 어휘만 완전 치환한다.
- 배지 문구(Blocked/Ready/Done)는 유지.
- 구 문자열(ModuleDesign, TaskCompletionReport, implementation task)이 코드·스키마·문서·스킬 어디에도 남지 않을 것 (완료 기준).

## 2. 노드 정의 (스키마·문서·스킬이 공유할 정본)

### Module (M)
**시스템의 의도된 구조를 이루는 하나의 구성 단위** — 응집된 책임을 지고, 계약(인터페이스)으로 바깥과 만난다.
- plan 층. SR 앵커는 기존 스키마 그대로 (필수 — 어떤 SR도 실현하지 않는 모듈은 스키마가 거부).
- **노드 하나 = 모듈 하나.** 여러 모듈을 한 노드가 다루지 않는다.
- 살아 있는 노드 — 개정·재승인된다.

### WorkItem (WI)
**Module을 완성시키기 위해 필요한 구조 또는 기능의 구현을 목표로 하는, 독립된 작업 단위.**
- **소속**: 하나 이상의 Module에 속한다 (1..N). **원칙은 하나** — 모듈의 분해라는 본분이 그것이다. 복수 소속은 본질적으로 모듈 사이에 있는 작업(통합 배선·계약 양측 구현)에 한하며, 여러 모듈을 만지는 작업이 잦다면 그것은 다중 소속으로 풀 게 아니라 **누락된 공통 Module의 신호**로 읽는다.
- Ready 판정(상향 사슬)은 **모든 소속 Module의 사슬**을 본다 — 어느 하나라도 non-green이면 가린다 (기존 다중 부모 규칙 그대로).
- 대상은 그 모듈의 **구조**(뼈대·저장·배선) 또는 **기능**(AC로 닫히는 동작) — 유형 필드는 두지 않는다. 구분은 short_name과 서술이 담는다.
- **독립성**: DEPENDS_ON 선행 충족 시 다른 WorkItem과 무관하게 착수·완료 판정 가능. 독립적으로 완료를 말할 수 없으면 굵기가 틀린 것.
- **굵기**: 한 회전에 잡을 만한 크기 — 기능이면 TARGETS AC 1~수 개.
- **DoD는 모든 WorkItem의 필수 자기 서술이다** — AC 유무와 무관하게, 작업으로서 무엇이 구현되고 어떤 동작이 수행되면 끝인지를 담는다. AC는 스펙의 판정 기준이고 DoD는 작업의 완료 조건 — 층위가 다르며, DoD가 AC 문장의 재인용이어선 안 된다.
- **AC 없는 WorkItem 허용** (구조·정비 류): TARGETS 없이 DoD만으로 선다. Progress·Sat 계산에는 영향 없음 (그 계산들은 AC 측에서 출발).
- **선언은 점증한다**: 전량 사전 분해를 요구하지 않는다 — 지금 보이는 것만 세우고 /plan 수정 모드로 추가한다.

## 3. 구체성 계조 (스킬·템플릿에 명문화할 핵심 규율)

| 층 | 반드시 담는 것 | 담지 않는 것 |
|---|---|---|
| Intent | 무엇을·왜 (기술 무관) | 기술 언급 (기존 승격 금지 유지) |
| **Module** | **기술 결정 명시** — 런타임·언어·저장소·핵심 라이브러리, 표준 명칭 그대로 (localStorage는 localStorage, setInterval은 setInterval — 은유·순화 금지). 구조. **시그니처 수준의 계약**. | 함수 본문·의사코드·코드 목록 |
| **WorkItem** | scope(무엇이 생기나)·대상 AC·의존·DoD | **구현 방법 전부** — 파일 목록·함수 설계·절차 (work 시점의 몫) |
| (work 시점) | 구현 계획 — 코드 탐색 후 수립, 노드 아님 | — |

- "코드 상세는 repo에"의 정확한 의미를 스킬에 명시: **결정과 계약은 스펙에, 본문은 repo에.** 기술 선택은 코드 상세가 아니라 설계 결정이다.
- 프로젝트 공통 스택 결정은 Decision 노드(plan 층)로 세우고 Module은 참조한다. Module 고유 선택만 Module의 Technology 절에.

## 4. 템플릿 교체 (`add-spec-node` 골격)

### Module 템플릿

```markdown
---
short_name: <모듈 이름>
name: <한 줄 정의>
edges:
  # SR 앵커, EXPOSES/CONSUMES 등 — 기존 스키마 엣지 그대로
---

## Responsibility
이 모듈이 시스템 안에서 지는 책임. 한 문단. 주어는 모듈.

## Technology
이 모듈이 서는 기술 — 런타임·언어·저장소·핵심 라이브러리. 표준 명칭 그대로.
공통 스택은 Decision 참조, 이 모듈 고유 선택만 여기에.

## Structure
구성요소와 그 사이의 선. 각 구성요소 = 이름 + 한 줄 책임.

## Contracts
EXPOSES 인터페이스의 계약 — 시그니처 수준 (이름·입력·출력·오류).
함수 본문은 쓰지 않는다.

## Behavior
핵심 시나리오별 동작. 상태·전이가 있으면 여기.

## Decisions
기각한 대안과 이유. 프로젝트 수준 결정은 Decision 노드로 승격하고 참조만.
```

- 구 템플릿의 "Hidden Decision" 절은 폐지한다 (구체성 회피의 은신처가 됐다 — 은닉할 결정이면 Decisions에 이유와 함께 쓴다).

### WorkItem 템플릿

```markdown
---
short_name: <작업 이름 — 구조/기능이 이름에서 드러나게>
edges:
  # Module 소속 엣지, TARGETS → AC (기능일 때), DEPENDS_ON → WI
---

## Scope
무엇이 생기거나 바뀌는가 — 결과 상태의 서술, 2~4문장.
구현 방법(파일·함수·절차)은 쓰지 않는다.

## Definition of Done
**작업으로서의 완료 조건** — 무엇이 구현되어 있고, 어떤 동작이 수행되는 상태로 끝나는가.
관찰 가능하게 서술한다 (실행하면 무엇이 보이는가, 호출하면 무엇이 답하는가).
TARGETS AC가 있어도 AC 문장을 재인용하지 않는다 — AC는 스펙의 판정 기준이고,
여기는 이 작업이 그 판정을 가능하게 만들기 위해 무엇을 세워야 하는가다.
예: "pause()/resume()이 스냅샷의 멈춤 구간을 갱신하고, 반복 호출에도 집중 시간
계산이 일관되다. 진행 화면에서 멈춤 중 남은 시간이 얼지 확인 가능하다."

## Notes (선택)
착수자가 알아야 할 맥락·위험 한두 줄. 계획이 아니라 귀띔.
```

- 구 템플릿의 7절(Description·Goal·Non-Goals·Scope·Deliverables·DoD·Risks)을 3절로 줄인다 — Goal/Non-Goals/Deliverables가 하던 말은 Scope가, Risks는 Notes가 담고, 나머지는 엣지가 이미 말한다.
- **두 템플릿의 예시문을 구체적 문체로 작성할 것** — 템플릿 안 예시가 은유적이면 전 노드에 그 문체가 번식한다. 예시에는 실제 기술 명칭이 등장해야 한다.

## 5. /plan 스킬 개정 — 2단 구조

```
1단 — 계획 (Shall 비관할): 에이전트 본연의 방식으로 —
      리포·기존 코드 탐색(읽기 전용), 기술 대안 검토, 모듈 경계와 작업 분해 설계
      → 사용자에게 제시하고 합의. 이 단계에서 노드를 쓰지 않는다.
2단 — 기입 (Shall 관할): 합의된 계획을 Module·WorkItem·Decision 문법으로 전사.
      기입 후 shall check 자기 검증.
```

- 1단의 규율을 스킬 본문에 명시: "노드를 쓰기 전에 코드베이스를 탐색하고 구체적 접근을 세워 승인받은 뒤에만 기입한다." (사용자가 플랜 모드를 켠 채 실행하는 것과 자연 호환.)
- **1단→2단은 /plan 실행 전체의 순서다 — 내부 단계(phase)마다 반복하는 구조가 아니다.** 탐색·기술 선택·모듈 경계·WorkItem 분해를 전체로 마치고 한 번에 합의한 뒤 일괄 전사한다 — 모듈 경계는 전체를 보고 긋는 것이므로 조각 합의는 경계 품질을 해친다.
- **--auto 유지**: --auto는 1단의 사용자 합의 정지만 생략한다 — 1단의 탐색·설계 자체는 동일하게 수행한다 (정지를 접는 것이지 일을 접는 것이 아니다). 산출은 전부 yellow — 웹 승인 관문 불변.
- 1단 초반에 **기술 선택 단계**를 넣는다: 기존 스택 정찰 → 제안 → 사용자 확정 → 프로젝트 수준이면 Decision 노드로 기록 (AFFECTS → 해당 Module들).
- WorkItem 저작 규율: 구체성 계조 표의 "담지 않는 것" 준수, 점증 선언 안내 ("지금 보이는 것만 — 이후 /plan 재실행으로 추가").

## 6. /shall.work 스킬 정합

개발 구간을 관문으로 구조화한다 — Shall 안은 선택과 검토·보고이고, **구현 계획부터 구현까지는 명시적으로 Shall의 범위 밖이다**:

1. **범위 밖 선언 (스킬 본문에 이 취지의 명시적 이양 문구를 넣을 것)**: WorkItem 선택이 확인되면(정지 1), 스킬은 다음을 지시한다 — *"여기서부터 구현 계획과 구현은 Shall의 범위 밖이다. 단, 이 구간의 전제는 변하지 않는다: **모든 일은 선택된 WorkItem의 달성 — 그 Scope와 DoD — 을 위한 것이다.** 그 전제 아래에서, 지금부터는 너의 본래 프롬프트, 이 프로젝트의 컨벤션·규칙(CLAUDE.md, 코딩 규칙, 테스트·커밋 관례)을 다시 엄밀히 살펴 그것을 상위 기준으로 진행하라. 코드 탐색, 파일·함수 수준 계획 수립, 구현, 그 방법과 품질 기준 전부가 그 세계의 일이다. WorkItem 밖의 개선거리를 발견하면 하지 말고 노트로 남겨라 (report의 Finding 재료). 완료했다고 판단되면 Shall로 돌아와 ②를 수행한다."* — Shall이 이 구간에 요구하는 것은 들어가기 전 접근 요지 한 줄(정지 1에서 선택과 함께 제시, --auto는 Journal 기록으로 대체)과, 나올 때 들고 올 재료(작업 노트·커밋·검증 결과)뿐이다.
2. **자기 검토 (Shall 복귀 지점)**: "다 구현되었다"의 판정을 감각이 아니라 대조로 — WorkItem의 **DoD를 대조**한다 (관찰 가능하게 성립하는가를 실행·호출로 확인). TARGETS AC가 있으면 해당 AC의 evaluation_process대로 돌려본 결과를 확보한다 (Evidence의 refs 재료). 미성립이면 다시 범위 밖으로 (구현 계속). 성립 불가 판단이면 Finding 노트로 남기고 (blocking 여부 판단) 해당 항목을 미완 처리.
3. **report 이행**: ②를 통과한 WorkItem만 CompletionReport의 대상이 된다 — CR의 완료 주장은 DoD 대조 결과에 근거한다. 이후 기존 절차 (정지 2 → 기입 → shall log).
- WorkLog 템플릿에 **구현 접근 요지** 절을 추가한다 — 범위 밖 구간에서 세웠던 접근의 요지 기록 (재구성 가능한 수준까지만, 절차 전문 아님).
- work 스킬 내 "task" 어휘를 WorkItem으로 전면 치환.

## 7. 판정·표시 정합 (동작 변화 없음 — 어휘·참조만)

- 보드 Implement 열, Blocked/Ready/Done 배지, isCompleted·upwardChain 술어: 판정 로직 불변, 대상 타입명만 WorkItem으로.
- 메타모델 팝업: Module·WorkItem·CompletionReport 반영 확인 (작업 후 실제 열어 대조).
- 기존 프로젝트의 구 타입명 노드는 스키마 위반 red로 자연 표시 — 자동 마이그레이션 없음.

## 8. 완료 기준

- 구 문자열(ModuleDesign·TaskCompletionReport·implementation task)이 전 영역에서 0건 (grep 검증). 스킬·커맨드 산문의 우회 표현도 정독으로 제거.
- `add-spec-node`가 새 템플릿(Module 6절, WorkItem 3절)을 산출하고, 템플릿 예시문에 실제 기술 명칭이 등장한다.
- /plan이 1단(탐색·합의, 무기입) → 2단(전사) 순서로 동작하고, 1단에서 어떤 노드도 쓰지 않는다.
- Module 노드에 Technology·Contracts 절이 있고, WorkItem 노드에 구현 방법 서술이 없다.
- AC 없는 WorkItem이 `shall check`를 통과한다.
- 보드·배지·팝업이 새 어휘로 동작하며 판정 결과는 리팩토링 전과 동일하다.

## 9. 구현 결정 (2026-08-23)

1. **소속 엣지 — `Module —ALLOCATES→ WorkItem` 유지, 유일 앵커로.** 모듈 파일에 기록하는 기존 엣지를 그대로 두고, WorkItem의 앵커에서 `TARGETS`(out)를 뺐다. 모듈 없는 WorkItem은 이제 `shall check`의 고아(red)이고 Fix Spec에 오른다 — "아무도 말해 주지 않는 저장된 백로그"는 없어졌다. 비용: 나중에 WorkItem을 더하면 모듈 파일이 바뀌어 모듈이 다시 yellow가 된다(점증 선언의 값이고, 기존 동작이다).
2. **TARGETS 0..N.** `core/arith/color.ts`의 겨냥 규칙에서 "작업 항목은 기준을 최대 하나만"의 첫 절을 제거했다. Evidence 절(로그의 증거는 그 로그가 ADDRESSES하는 WorkItem들이 TARGETS하는 기준의 합집합만 claim)과 보고서 절(CompletionReport 하나는 정확히 하나의 WorkItem을 claim)은 그대로다.
3. **'task' 어휘는 식별자·필드·패널명까지 전부 개명.** `taskState → workItemState`, `spec.taskBoard → spec.workBoard`, 패널 Task Board → Work Board(라우트 `work-board`), 번들 `task-closure → work-item-closure`, 보드 행 키 `task:<id> → work-item:<id>`, `task-state.ts → work-item-state.ts`, `taskStateOf → workItemStateOf`, `isClosableTask → isClosableWorkItem`, `TaskBoard/taskBoardOf → WorkBoard/workBoardOf`. `--json` 필드와 응답 모양은 ARCHITECTURE의 "아직 얼지 않은 것"이다. 예외 둘: 장부 키 `taskHash`·`reports`(동결 바이트)와 번들 id 접두 `completion:`(완료 보고서에 대한 카드라 이름이 맞다).
4. **닫힘 주체 태그.** `ClosureSubject`는 `"criterion" | "workItem"`이 됐다 — 태그는 디스크에 남지 않고 코덱이 `workItem → taskHash/reports`로 매핑한다. 장부의 바이트는 한 글자도 움직이지 않는다.
5. **Interface·DataSchema는 그대로.** 스펙이 침묵하므로 두 타입·엣지·템플릿은 손대지 않았다. Module의 `## Contracts`는 그 모듈이 EXPOSES하는 인터페이스의 **시그니처 수준 요약**(이름·입력·출력·오류)이고 각 줄이 Interface 노드를 이름한다; 의무(사전·사후·불변·프로토콜)는 Interface 노드에만 산다. 같은 말을 두 곳에 쓰지 않는다.
6. **1단의 정지는 둘, `--auto`는 그 둘만 뺀다.** 정지 A = 기술 선택 확정, 정지 B = 전체 계획 합의. 둘 다 터미널의 정지다. 모든 모드에서 2단이 한 번에 쓰므로 브라우저 대기는 끝에 한 번뿐이다(단계 사이 대기는 사라졌다). 선택지 질문(AskUserQuestion)은 `--auto`에서도 묻는다 — 기본값이 감당하는 것은 Assumption으로 모듈에 매단다.
7. **/plan이 쓰는 Decision은 한 종류다.** 1단에서 확정된 프로젝트 공통 기술 결정만 — `Decision —AFFECTS→ Module`로 2단에 모듈 뒤에 쓴다. 나머지 결정은 여전히 `/shall:raise`의 것이다. 이 Decision이 yellow면 카드 하나를 뿌리로 세우고 AFFECTS가 닿는 모듈이 그 안에 실린다.
8. **WorkLog의 새 절 이름은 `Approach`** — 범위 밖 구간의 접근 요지(재구성 가능한 수준, 절차 전문 아님). Narrative·Outcome 앞에 선다.
9. **템플릿 힌트는 영어 한 줄.** Module 6절·WorkItem 3절·WorkLog 3절의 힌트는 `core/graph/guide.ts`의 한 줄 영문이고, Technology와 Definition of Done의 힌트가 실제 기술 이름(localStorage·setInterval 등)을 예로 든다. §4의 "2~4문장" 같은 수치 길이 규칙은 힌트에도 스킬 산문에도 쓰지 않는다("briefly"). §4의 한국어 설명문은 힌트의 취지이지 바이트가 아니다.
10. **마이그레이션 없음 + 손 경로.** 옛 타입 폴더는 로더가 모르는 타입으로 읽어 problems에 오른다. 손으로 옮기는 길은 `git mv` 셋(`plan/ModuleDesign → plan/Module`, `plan/ImplementationTask → plan/WorkItem`, `execution/TaskCompletionReport → execution/CompletionReport`) — id는 그대로(접두는 제안일 뿐), 엣지는 전부 그대로 풀리고, 그 노드들의 승인만 페이로드의 `<type>/<id>` 때문에 실효해 yellow로 돌아온다. README Project files 절에 같은 문단이 있다(옛 이름 없이 이 표를 가리킨다). **demo1은 옮기지 않았다** — 그 plan 노드들은 옮길 때까지 broken이다.
11. **완료 기준 grep의 제외 목록.** 이 스펙의 개명표(§1)와 역사 문서 — `docs/Shall_Specify_Process_v1_3.md`, `docs/Shall_Work_Raise_Skill_Spec.md`, `docs/Shall_Specify_Canon_Mapping.md`, `docs/Shall_Refactor_QD_Finding_Spec.md`, `docs/Shall_Help_Skill_Spec.md`, `docs/Shall_Activity_Feed_Spec.md`, `docs/plans/*`(스스로 임시라 적힌 파일; 삭제는 이번 라운드 밖), 그리고 다른 시스템의 설계를 참조용으로 압축한 `LEGACY-ARCHITECTURE.md` — 는 건드리지 않았다. 살아 있는 문서(README·ARCHITECTURE·plugin README·OPEN_QUESTIONS·plan-dogfood)는 개정했고, 거기에는 옛 이름을 문자 그대로 쓰지 않고 이 표를 가리킨다. `docs/Shall_Plan_Process_v1.md`는 2단 구조의 `Shall_Plan_Process_v2.md`로 다시 써 v1을 지웠다. `core/README.md`·`daemon/README.md`에는 구 어휘가 없었다.
12. **린트 규칙 (f).** `scripts/lint-plugin.mjs`가 플러그인 산문에서 `ModuleDesign`·`ImplementationTask`·`TaskCompletionReport`와 "implementation task"를 거부한다(부정하는 문장은 예외 — `DENIED_RELATIONS`와 같은 모양). 규칙 (b)의 `--type` 검사는 canon을 따라 자동으로 바뀐다.
13. **스킬 산문의 범위.** plan 스킬은 phase-1/2/3 참조 파일을 지우고 stage-1·stage-2와 세 기준 파일(modules·contracts·work-items)로 바꿨다; work 스킬은 정지 1 뒤의 이양 문구, 접근 요지 한 줄, 복귀 시 DoD 대조·AC evaluation process 실행, DoD를 통과한 항목만 CompletionReport, WorkLog의 Approach 절을 받았다. 두 스킬·authoring·help·README·plugin.json(0.6.0)에서 "task"는 work item/WorkItem으로 바뀌었다.
14. **린터가 품은 옛 이름.** 규칙 (f)는 세 옛 이름을 데이터로 품으므로 `scripts/lint-plugin.mjs`는 완료 기준 grep에서 제외한다 — 금지를 집행하는 파일이지 잔재가 아니다.
15. **덤으로 고친 것 하나.** `core/arith/plan-seams.ts`가 템플릿 문자열 안에 날 NUL 바이트를 품고 있어 `file(1)`과 plain `grep`이 이 파일을 이진으로 취급해 건너뛰었다 — `\u0000` 이스케이프로 바꿨다. 동작은 같고, 이제 grep에 보인다.
