# Shall — Vitals 구현 명세

프로젝트의 진척과 스펙의 온전함을 보여주는 control plane 표면을 구현한다. 두 그룹: **Progress**(얼마나 왔나 — 비율 4행), **Spec Health**(스펙이 온전한가 — 부재 탐지 체크리스트 7규칙).

전제: Plan 층 리팩토링(Module·WorkItem·CompletionReport 개명, WorkItem의 DoD 필수화·AC 없는 WorkItem 허용·다중 Module 소속 1..N)이 이미 적용된 코드베이스를 기준으로 한다. 이 문서의 어휘는 그 리팩토링 이후 기준이다.

## 0. 원칙

- **전부 계산이다 — 저장 0.** 어떤 지표·위반 목록·스냅샷도 디스크에 저장하지 않는다. 로드 시 spec/·ledger에서 재계산한다.
- **종합 점수·등급을 만들지 않는다** ("건강 87점" 금지 — 단일 점수는 게임화 유인이다). 지표는 각자 표시된다.
- 판별은 그래프 사실(엣지·자식·필드·frontmatter 유무)만 사용한다 — 노드 본문(markdown)의 내용 해석이 필요한 검사는 넣지 않는다.
- 기존 술어를 재사용한다 — 색·open/closed·Blocked/Ready/Done·acceptance 유효성·게이트 산식. 이 표면을 위한 새 판정 로직을 만들지 않는다 (아래 Sat/Unsat 롤업만 신규).
- **아래 텍스트 레이아웃은 구성의 순서·흐름 참고용이다. 디테일한 시각 구현(간격·타이포·컴포넌트 선택·바 스타일 등)은 기존 디자인 시스템을 고려해 다시 디자인한다.** 디자인 시스템에 있는 요소만 사용하고, 없으면 신설하지 말고 멈추고 보고한다.

## 1. 선행 작업 — Sat/Unsat 배지 (spec plane)

Progress의 만족률이 쓰는 롤업 판정을 spec plane 배지로도 노출한다:

- **대상**: AC를 가질 수 있는 두 타입 — Requirement, Scenario.
- **판정 (계산)**: 산하 AC 전부 closed → **Sat** / 하나라도 open → **Unsat** / **AC 0개 → 배지 없음** (미충족이 아니라 미명세 — Unsat을 달지 않는다).
- **표시**: 노드 ID 우측, AC의 open/closed 마크와 같은 자리 문법. 충족 축의 상위 계층이다 (새 축이 아님 — 등록 R/Y/G·진행 Blocked/Ready/Done과 독립).
- **색**: Sat은 그린 계열이되 노드의 등록 green과 형태로 구분 (Done 배지와 같은 규율). Unsat은 중립(회색) — 오류가 아니라 여정 중이므로 경고색 금지.
- 저장 없음, 상호작용 없음.

## 2. Progress — 비율 4행

| 표시명 | 산식 | 주석 |
|---|---|---|
| Scenario Satisfaction | Sat Scenario / AC 보유 Scenario | "n unspecified" (AC 0개 분모 제외분) |
| Requirement Satisfaction | Sat REQ / AC 보유 REQ | "n unspecified" |
| AC Closure | closed AC / 전체 AC | — |
| WorkItem Completion | Done WorkItem / **전체 WorkItem (Blocked 포함)** | "n blocked" |

(WorkItem 행의 "n blocked" 주석은 뺐고, "AC"는 카드·페이지 모두 풀네임 `AcceptanceCriterion`으로 쓴다 — 2026-08-24 결정, §7 참조)

- 분모 규율: 만족률 분모에서 AC 0개 노드를 제외하되, 제외 수를 주석으로 반드시 표시한다 (숨기지 않는다). WorkItem 분모는 전체다 — Ready만 분모로 잡으면 상류가 막힐수록 진행률이 오르는 역설이 생긴다.
- 행 순서 고정: Scenario → Requirement → AC → WorkItem (스펙의 하강 순서).

## 3. Spec Health — 체크리스트 7규칙

**성립 원칙 (잔여층)**: red(문법 오류 → Fix Spec 소관)도 yellow(판정 대기 → 리뷰 큐 소관)도 아닌, **"틀리지 않았고 확인 대기도 아닌데 덜 된 것"**만 담는다. 규칙을 추가할 때는 이 배타 검사를 먼저 거친다 — 다른 두 층이 잡는 것을 여기 중복 표시하지 않는다.

| # | 규칙 | 판별 |
|---|---|---|
| 1 | AC 없는 Requirement | HAS_CRITERION 0 |
| 2 | AC 없는 Scenario | HAS_CRITERION 0 |
| 3 | UC 없는 Actor (전 kind) | ASSIGNED_TO 역방향 0 |
| 4 | main scenario 없는 UC | CONTAINS 하위 중 main 0 |
| 5 | SR에 닿지 않는 Goal | 하강 사슬 도달 불가 (P4 산식 재사용) |
| 6 | WorkItem 없는 Module | 소속 WorkItem 0 |
| 7 | 어떤 WorkItem도 겨냥하지 않는 AC | WorkItem→AC (TARGETS) 역방향 0 |

(규칙 3·4의 엣지명은 구 캐논이고 규칙 4의 'main'은 그래프 사실이 아니다 — 2026-08-24 결정으로 현행 캐논에 맞게 바뀌었다, §7 참조)

- 위반은 오류가 아니다 — 표시에 경고색(red 계열)을 쓰지 않는다. 중립 아이콘·색으로.

## 4. Overview 하이라이트 패널

구성 (순서·흐름 참고 — 시각 구현은 디자인 시스템으로 재설계):

```
Vitals
  Progress
    Scenario     [바] 7/9
    Requirement  [바] 5/12
    AC           [바] 24/40
    WorkItem     [바] 8/14
  Spec Health    3 rules violated     ← 0이면 "all checks passed" 류의 짧은 확인
```

- Progress: **바 4개 + n/m** — 라벨은 짧은 형태, 주석(unspecified/blocked)은 하이라이트에서 생략. (바 요소는 디자인 시스템에 없어 §0대로 멈춰 보고했고, 2026-08-24 결정으로 설치했다 — §7 참조)
- Spec Health: **위반 규칙 개수 한 줄만** — 어떤 규칙인지는 페이지에서.
- 카드 클릭 시 Vitals 페이지로 이동.

## 5. Vitals 페이지

**세로 단일 흐름** — Progress 섹션 아래에 Spec Health 섹션 (열로 나란히 쌓지 않는다).

### Progress 섹션
- 행마다: 정식 명칭 / 바 + n/m / 주석 (해당 시). 하이라이트와 같은 바 시각 요소의 상세판.
- 행 펼침 (드릴다운):
  - Satisfaction 행 → Unsat 노드 명단 (ID·이름·미결 AC 수)
  - AC Closure → open AC 명단, **사유 3분해**: 증거 없음 / 심사 대기 (리뷰 큐 해당 카드 링크) / 반려 재개방 (rationale 인라인)
  - WorkItem Completion → Blocked 명단 + 차단 원인 노드 링크 (2026-08-24 결정으로 미완 WorkItem 전체의 평면 목록 + 상태 단어로 바뀌었다 — §7 참조)
- 모든 노드 참조는 spec plane 이동 링크.

### Spec Health 섹션
- 7규칙 **전수 상시 표시** — 0건 규칙도 줄 유지 (통과 표시와 함께 — "검사됐고 깨끗함"의 확인). **위반 규칙을 상단 정렬** (세로 훑기에서 먼저 만나도록).
- 위반 규칙 펼침: 노드 명단 (→ spec plane 이동) + 말미에 해소 커맨드 안내 한 줄 (예: AC 부재 → "/specify로 AC를 도출하세요", WorkItem 부재 → "/plan으로 분해를 이어가세요").

### 공통
- 헤더: 제목 + 마지막 계산 시각. 기간 필터·설정 없음 (스냅샷이지 시계열이 아니다).
- **빈 상태**: 스펙 공백 프로젝트면 바·체크리스트 대신 "아직 측정할 스펙이 없습니다 — /specify로 시작" 안내로 페이지를 대체.

## 6. 완료 기준

- Vitals 관련 어떤 상태도 디스크에 저장되지 않는다.
- Progress 4율의 분모 규율(unspecified 제외+주석, WorkItem 전체 분모)이 지켜진다.
- Spec Health 7규칙이 전수 표시되고, 위반이 red 계열 색으로 렌더되지 않는다.
- Sat/Unsat 배지가 REQ·Scenario에 판정대로 표시되고, AC 0개 노드에는 배지가 없다.
- 하이라이트의 바·개수와 페이지의 상세가 같은 계산을 읽는다 (수치 불일치 없음).
- 드릴다운의 모든 노드 참조가 spec plane으로 이동한다.
- 종합 점수·등급이 어디에도 없다.

## 7. 구현 결정 (2026-08-24)

구현하며 확정한 것. 명세 본문은 고치지 않고, 바뀐 자리에는 이 절을 가리키는 한 줄만 달았다.

1. **§3의 엣지명은 현행 캐논(`core/graph/grammar.ts`)으로 읽는다.** 표의 `ASSIGNED_TO`·`CONTAINS`는 지금 캐논에 없다(`SATISFIES`·`DERIVED_FROM`도 마찬가지). 매핑: 규칙 1·2 `Requirement/Scenario —HAS_CRITERION→ AC` 정방향 0(이름 그대로); 규칙 3 "`ASSIGNED_TO` 역방향 0" → `Actor —PERFORMS→ UseCase` **정방향** 0 — "(전 kind)"는 Actor의 종류가 본문 절(`## Actor Type`)에만 있어 그래프 사실이 아니므로 공허하다: 모든 Actor를 본다; 규칙 4 "`CONTAINS` 하위 중 main 0" → `UseCase —DETAILS→ Scenario` 정방향 0 — **'main'은 그래프 사실이 아니다**(시나리오의 종류는 본문 절 `## Scenario Type`이고 frontmatter 키 집합은 닫혀 있어 낯선 키는 파일 거부→red), §0의 본문 해석 금지와 충돌하므로 **"Scenario 없는 UseCase"로 약화**해 7규칙을 유지한다(삭제·frontmatter 필드 신설 대신 사용자 결정); 규칙 5 P4 사슬은 `Goal —PURSUED_BY→ Actor —PERFORMS→ UseCase —DETAILS→ Scenario —DERIVES_RESPONSIBILITY→ SystemResponsibility` — 이 사슬을 계산하는 코드는 없었다(specify 스킬 산문뿐). 새로 살아있는 SR 전부에서 incoming을 거꾸로 한 번 flood하고 **`Goal —REFINES→ Goal`은 내려간다**(부모 goal은 자식이 닿으면 닿은 것 — phase-1의 충분성 질문); 규칙 6 `Module —ALLOCATES→ WorkItem` 정방향 0; 규칙 7 `WorkItem —TARGETS→ AC` 역방향 0. 산문(README·ARCHITECTURE)은 새 이름만 쓴다.
2. **존재 정책 — 파일이 쓴 줄이 '있음', 살아있고 닫힌 것이 '충족'.** "AC가 있다"는 캐리어 파일이 `HAS_CRITERION`을 한 줄 이상 썼다(대상 id 중복 제거, `writtenEdgesOf` 재사용)는 뜻이고, Sat은 쓴 대상 전부가 살아있고 `closure === "closed"`인 것이다. 답하는 파일이 없는 AC를 쓴 캐리어는 **Unsat**(미명세가 아니라 미충족)이고 규칙 1·2의 행이 아니다 — 구멍 자체는 Fix Spec의 `missing` 행이다. 규칙 3·4·6도 쓴 엣지 수, 규칙 7은 incoming TARGETS(살아있는 파일의 엣지만 존재), 규칙 5는 살아있는 노드만 통과하므로 구멍 위의 Goal은 도달 불가로 등재된다(Fix Spec과의 중복은 불가피, 수용). 불변식 `{R | satisfaction === null} == 규칙1.nodes`는 테스트로 고정. 닫힘은 색을 읽지 않으므로 문구가 반려된 AC도 닫혀 있으면 닫힌 것 — red AC 옆에 Sat이 설 수 있다(새 판정 금지 원칙).
3. **배제 정책 — 규칙 수준 배타, 노드 수준 포함.** 7규칙 모두 red 사유·yellow 대기를 재진술하지 않음은 앵커 표로 확인했다(Goal은 뿌리, Requirement·Scenario·Actor·Module의 앵커는 제 자식이 아니라 제 부모, TARGETS는 양끝 어느 쪽도 잡지 않는다). 그 위에서 대상 타입의 살아있는 노드는 **색과 무관하게 전부** 검사·집계하고 행은 색을 싣지 않는다 — 초안 스펙은 전부 yellow이고 그때가 "AC 없는 Requirement"가 가장 쓸모 있는 순간이며, 승인·반려로 구조 수치가 움직이면 리뷰 큐와 어긋나는 둘째 자리가 된다. `deletionProposed` 노드도 살아있는 것으로 센다. 거부된 파일 속 노드는 어느 수치에도 없다(Fix Spec 소관).
4. **Sat/Unsat의 집은 `ReviewStatus.satisfaction: "sat" | "unsat" | null`.** `core/arith/satisfaction.ts`의 롤업 하나를 `reviewGraph`가 캐리어마다 상태에 싣고(닫힘 verdict는 메모해 한 번만 해시), 배지(`spec.review`)와 Vitals 비율이 같은 필드를 읽는다. `NodeStatus`가 `ReviewStatus`를 펼치므로 `shall status --json` 행에도 실린다(`--json` 필드는 미동결). 캐리어 타입은 문법표에서 `HAS_CRITERION`의 출발 타입을 읽는다(철자 반복 없음).
5. **페인트.** Sat은 Done·Closed와 같은 채운 에메랄드 pill(등록 green인 네모와 같은 색조, 다른 형태 — 단어만 다르다), Unsat은 디자인 시스템의 조용한 secondary 배지. 캔버스 카드·노드 패널의 ID 자리 셋 다 같은 슬롯 문법(`SecondAxisMark`의 셋째 arm).
6. **open AC의 3분해.** `leftOpen !== null` → `left-open`(rationale 전문 인라인); 아니면 살아있는 claimant 0 → `no-evidence`; 아니면 `awaiting-review` — 이때 `bundleId`는 큐가 **지금** 카드를 자를 때만(`closureAsks`: AC green ∧ claimant 전부 green ∧ 판정 없음) `closure:<AC>`이고, 증거가 아직 yellow면 null이라 페이지는 링크 대신 "evidence awaiting approval"을 쓴다. 서로소·전수. 카드 id 철자는 `bundles.ts`에서 export한 `closureBundleIdOf` 하나.
7. **WorkItem 드릴다운은 미완 항목의 평면 목록.** 처음에는 §5대로 Blocked 명단 아래 차단 원인(미완료 선행 `unfinished`·답 없는 id `missing`·green 아닌 상향 사슬 `unread`)을 계층으로 실었으나, 화면을 본 뒤의 사용자 결정(2026-08-24)으로 다른 세 행과 같은 폼 — done이 아닌 WorkItem 전부를 id 순 한 목록으로, 각자 `workItemState`(`ready`/`blocked`) 단어와 함께 — 로 바꿨다. 와이어는 `CompletionRow.open: (Ref & { workItemState })[]`이다. 같은 결정의 연장으로 §2의 "n blocked" 주석도 바 옆에서 뺐다 — 이 행의 분모는 아무것도 빼지 않으므로(전체 WorkItem) 곁에 말할 제외분이 없고, blocked 몇인지는 드릴다운의 행마다 붙은 단어가 답한다; 위 세 행과 같은 폼이 된다. 차단 원인은 이 표면 어디에도 없다 — 되살리려면 `core/arith/vitals.ts`의 open 행에 원인 필드를 더하는 한 자리다(기존 술어 `prerequisitesOf`·`upwardChainOf`의 합성으로 충분하다).
8. **빈 상태.** `empty = 살아있는 노드 0 ∧ 거부된 파일 0` — core가 계산한다. 전부 깨진 프로젝트는 빈 상태가 아니라 0/0 행을 보인다(Fix Spec 소관).
9. **마지막 계산 시각은 클라이언트의 스탬프.** `spec.vitals` 응답에 시계를 싣지 않는다(데몬은 core의 답에 아무것도 더하지 않고, core에는 시계가 없다); 웹이 fetch가 resolve한 순간을 찍어 `Computed <locale>`로 보인다 — 매 ask마다 새로 계산하므로 그 순간이 곧 계산 순간이다.
10. **바.** 디자인 시스템에 progress/meter가 없어 §0대로 멈춰 보고했고, 사용자 결정으로 shadcn 레지스트리(base-nova, Base UI Progress)의 `progress`를 `apps/web/src/components/ui/progress.tsx`로 설치해 썼다 — 같은 시스템의 요소를 들인 것이지 신설이 아니다. 기본 페인트(primary) 그대로, 셋째 초록 없음.
11. **표면.** 패널 제목은 "Vitals"(`"Shall Vitals"`에서 개명); Overview 카드는 §4의 모양대로 같은 레벨의 두 그룹 — 제목 "Progress"(행보다 굵은 `font-medium`) 아래 바 넷 + n/m(주석 생략), 제목 "Spec Health"는 같은 무게의 제목 줄에 상태 요약 한 줄을 인라인으로(그 절의 내용 전부가 그 한 줄이라 제목 아래가 아니라 곁에; 처음엔 다섯째 행의 배지 → 캡션 그룹 → 이 모양, 전부 2026-08-24 결정) — 이고, 카드의 네 행은 제목 아래로 들여 쓰며 요약은 막대의 왼쪽 선에 맞춘다; 표시명 "AC Closure"는 카드·페이지 모두 풀네임 "AcceptanceCriterion Closure"로(축약 라벨도 "AcceptanceCriterion") — 문은 형제 카드와 같은 둘(제목·View all); 페이지는 `PanelDetail`의 넷째 arm, 세로 한 흐름; 드릴다운은 하우스 `Collapsible`; 위반 표시는 secondary 배지의 노드 수·outline "passed"로 red 계열 없음; 7행 전수·위반 상단(정렬은 core); 힌트는 웹의 `Record<RuleId, string>`(실제 커맨드명 `/shall:specify`·`/shall:plan`). 사이드바 뱃지 없음(Activity Feed 선례). 카드와 페이지는 같은 훅으로 같은 프로시저 하나를 읽는다(요약 프로시저 없음).
12. **daemon.** `service/spec-vitals.ts`의 `vitalsOver`/`vitals`, 라우터 `spec.vitals({projectId})` — projectId 가족, 읽기 전용, 장부가 안 읽히면 CASUALTY `vitals` 문장으로 통째 거부. CLI `shall vitals`는 이번 라운드에 넣지 않았다(스펙이 control plane만 말한다; 반전 레시피는 `docs/OPEN_QUESTIONS.md`).
13. **플러그인 산문 무변경.** 새 패널은 플러그인 산문을 얻지 않는다는 선례대로. help 스킬이 `satisfaction`을 읽을지는 OPEN_QUESTIONS에.
14. **종합 점수·등급 없음**, 수치 길이 규칙 없음, 본문 해석 없음 — 본문만 바꾼 두 그래프의 vitals가 같다는 테스트로 고정.
