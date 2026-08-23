# Shall — Activity Feed 구현 명세

사람이 웹에서 "최근에 무슨 일이 있었나"를 훑는 단순 기록 패널을 구현한다.

## 0. 정체와 원칙

- **feed는 사람용 근황 요약이다 — 프로젝트 진행의 정본이 아니다.** 실제 일의 기록은 그래프(Journal·WorkLog·Evidence·Finding·TCR)와 판정 장부(approvals·rejections·acceptances)와 git에 있다. feed 파일이 통째로 소실되어도 프로젝트는 무결해야 한다 — 어떤 계산·검증·인계도 feed에 의존하지 않는다.
- feed에는 승인도 색도 없다. 리뷰 대상이 아니다.
- **에이전트에게 feed를 노출하는 읽기 경로를 만들지 않는다.** feed 읽기는 웹 API에만 존재하며, CLI에 feed를 출력하는 명령은 존재하지 않는다. 에이전트가 과거를 알아야 하면 정본(Journal·Finding·board·status)에서 읽는다.
- 시각 요소는 기존 디자인 시스템 컴포넌트만 사용한다. 없으면 신설하지 말고 멈추고 보고한다.

## 1. 저장

```
.shall/ledger/feed/YYYY-MM.yaml     월별 파일. git 추적 (ledger 공통)
```

- **전 타입 낱개 append — 예외 0.** 병합·수정·삭제 없음 (append-only). 항목은 시간순.
- 레코드는 정해진 형태의 최소 구조화 요약만:

```yaml
- at: 2026-08-21T14:03:00Z
  kind: approved
  refs: [REQ-14, AC-31]        # 관련 노드 ID (드릴다운용)
  summary: ""                   # 에이전트 제출 타입만 사용. 데몬 타입은 빈 값 — 문장은 렌더가 kind·refs에서 생성
  by: yongjun                   # 판정 타입만
```

- 쓰기 주체는 데몬뿐이다 (에이전트 제출도 `shall log` 경유로 데몬이 기입).

## 1-b. `shall log` CLI 신설 (이 작업에 포함)

- 신설: `shall log <kind> <summary> [--refs id,id...]` — 데몬에 제출하고, 데몬이 feed에 기입한다.
- **원칙 정합**: 에이전트의 파일 저작 표면이 `.shall/spec/`뿐이라는 규칙은 유지된다 — feed 파일에 쓰는 손은 데몬이고, 에이전트는 요청만 한다. ledger 직접 쓰기 deny 규칙도 그대로 유효하다.
- kind는 에이전트 타입 enum(`specify_done`·`plan_done`·`work_done`)만 허용한다 — 판정 타입(`approved`·`rejected`·`ac_closed`)은 이 문으로 쓸 수 없다 (데몬이 거부). 판정 타입의 유일한 발생 경로는 데몬 자신의 ledger 쓰기 부산물이다. (판정 타입 자체가 2026-08-23 결정으로 미적용 — §7 참조; 지금은 넷 밖의 어떤 kind도 같은 문장으로 거절된다)
- 반환은 성공/실패뿐 — 어떤 feed 내용도 반환하지 않는다 (쓰기 전용 단방향).
- **스킬 수정 (이 작업에 포함)**: /specify·/plan·/shall.work 세 커맨드의 말미(/specify는 전 phase 완주 후 종료 직전 — phase마다가 아니다. /plan·/shall.work는 기입·자기 검증 후 종료 직전)에 해당 kind의 `shall log` 호출을 정확히 1회 추가한다.
  - log 실패는 본 작업의 실패가 아니다 — 데몬 미가동 등으로 실패하면 "기록 실패"를 알리고 정상 종료한다 (feed 비의존 원칙의 스킬판).
  - 진행 중 중간 로그는 여전히 금지다 (§2 규약).

## 2. 타입 카탈로그

### 에이전트 제출 (커맨드 말미 1회 — `shall log <kind> <요약>`)

| kind | 시점 | summary 예 |
|---|---|---|
| `specify_done` | /specify 완료 시 (전 phase 완주 — loop-ready 선언 시점) | "스펙 도출 완료 — Goal 2, UC 3, REQ 8, AC 12" |
| `plan_done` | /plan 완료 시 | "모듈 설계 완료 — MD 2, task 6" |
| `work_done` | work 회전의 report 기입 직후 | "회전 완료 — WorkLog 3, Evidence 4" |

- **커맨드 말미에 정확히 1회.** 진행 중 중간 로그·부분 보고는 규약 위반이다 — 활동의 기록은 활동이 끝나야 쓴다. 각 스킬(specify·plan·work)의 말미 절차에 이 호출을 추가하는 작업을 포함한다.
- `shall log`는 **쓰기 전용 단방향** CLI다: 성공/실패만 반환, 어떤 feed 내용도 반환하지 않는다. kind는 위 enum만 허용 (자유 kind 금지).

### 데몬 기록 (사건 발생 시 자동 — 별도 채널 불요, 자기 쓰기의 부산물)

(2026-08-23 결정으로 미적용 — §7 참조)

**리뷰 큐의 판정 종류와 1:1로 맞춘다** — 사람이 하는 활동은 큐에서의 판정뿐이므로, feed의 데몬 타입도 그 셋이 전부다:

| kind | 대응하는 리뷰 큐 판정 | 검출 |
|---|---|---|
| `approved` | Spec Approval 승인 · Work Report 접수 · 삭제 제안 승인 | approvals 쓰기 시 |
| `rejected` | 반려 (Spec·Evidence 미흡 공통) | rejections 쓰기 시 |
| `ac_closed` | AC Closure 닫힘 | acceptances 쓰기 시 |

- gate_passed·milestone 류의 계산 전이는 feed에 기록하지 않는다 — 사람의 활동이 아니라 파생 상태다. 이정표의 표시가 필요해지면 vitals의 소관으로 넘긴다.

## 3. 렌더 (웹 패널)

- 월 파일 로드 → 시간 역순 타임라인.
- **연속 병합 (fold)**: 인접한 같은 kind의 판정 타입(approved·rejected·ac_closed)은 한 항목으로 접는다 — "승인 10건 — REQ-14 외" (count + 대표 refs). 다른 kind가 사이에 끼면 쪼개진다: 승인 5 → work_done → 승인 5 = 세 항목. (2026-08-23 결정으로 미적용 — §7 참조)
  - 에이전트 타입은 병합하지 않는다 — 납품은 낱개가 사건이다.
  - 병합 항목의 시간은 시작–끝 범위로 표시한다 ("14:00–14:23").
- 문장은 렌더가 kind·refs·count에서 생성한다 (에이전트 제출 타입은 summary 그대로 표시).
- refs 클릭 시 해당 노드(spec plane) 또는 판정 상세로 이동.
- 병합 기준은 렌더의 것이다 — 저장이 낱개이므로 이후 병합 기준을 바꿔도 과거 데이터가 재해석된다.

## 4. 명시적으로 넣지 않는 것

- 개별 노드 추가·수정 사건 (git과 Journal이 그 기록이다)
- 리뷰 큐·보드 항목의 등장·소멸 (계산 상태의 저장이 된다)
- work의 시작·중간 정지 (터미널 대화의 일 — feed 사건은 납품 1회뿐)
- git 커밋 낱개 (WorkLog frontmatter의 sha가 담는다)
- feed를 읽는 CLI 명령 (§0)

## 5. 구현 시 결정할 소형 미결 (구현자가 제안 후 확정)

1. **raise 착지의 feed 반영**: 착지 (a)~(c)는 활동이다 — `raise_landed`를 에이전트 타입에 추가할지, Decision 승인(데몬 기록)으로 충분한지.

## 6. 완료 기준

- 전 타입이 낱개 append로 저장되고, 파일은 월별 1개다. 어떤 항목도 수정·삭제되지 않는다.
- 렌더에서 연속 판정 타입이 접히고, 다른 kind 개입 시 쪼개진다. 병합 항목에 시간 범위·count·대표 refs가 표시된다.
- `shall log`가 enum 외 kind를 거부하고 (판정 타입 포함), 아무것도 반환하지 않는다 (쓰기 전용).
- 데몬 미가동 상태에서 스킬 말미의 log가 실패해도 본 작업(승인 완료·report 기입)은 정상 종료한다.
- feed 내용을 출력하는 CLI 명령이 존재하지 않는다.
- feed 파일을 삭제해도 색·게이트·보드·리뷰 큐 등 어떤 계산도 영향받지 않는다 (정본 비의존 검증).
- 각 스킬 말미에 `shall log` 호출이 1회 추가되어 있다.

## 7. 구현 결정 (2026-08-23)

구현하며 확정한 것. 명세 본문은 고치지 않고, 바뀐 자리에는 이 절을 가리키는 한 줄만 달았다.

1. **데몬 판정 kind(`approved`·`rejected`·`ac_closed`)와 그 훅·`by`는 넣지 않는다.** 리뷰 큐에서 일어난 일은 feed에 쓰지 않기로 했다 — 판정은 장부 세 권에 있고 feed는 그것을 되풀이하지 않는다. §2의 "데몬 기록"과 §6의 그 항목은 미적용이다.
2. **feed는 에이전트 kind 넷뿐이다** — `specify_done`·`plan_done`·`work_done`·`raise_landed`. §5-1은 `raise_landed`를 추가하는 쪽으로 확정: 착지 (a)(b)(c)에서 1회, (d)는 기록하지 않는다. refs는 결정 id, 발견 id, 결정이 고친 id 순. (c)는 파일 둘에 호출 하나.
3. **fold는 없다.** 접히는 것은 판정 kind뿐이었고 그것이 없으니 접을 것이 없다 — 한 줄에 한 행, 최신순.
4. **레코드는 `{at, kind, refs, summary}`다.** `by`는 없고, `summary`는 항상 비어 있지 않다(에이전트의 한 줄). 모르는 kind는 데몬이 목록과 함께 문장으로 거절한다.
5. **저장은 월 파일을 읽어 한 건을 덧붙이고 원자적으로 다시 쓴다**(임시 파일 + rename). append-only는 의미론이다 — 어떤 레코드도 수정·삭제되지 않는다. 파싱할 수 없는 월 파일 위에는 쓰지 않고 거절한다. 월은 UTC(`at`의 앞 7자)라 KST 말일 밤의 run이 다음 달 파일에 앉을 수 있다 — 아무것도 의존하지 않으므로 수용한다. refs는 노드 id 모양만 받는다.
6. **웹 패널은 타임라인이 아니라 Review Queue·Task Board와 같은 구성의 표**(`PanelTable`, Kind·Event·Refs·When 네 열)다. 새 프리미티브 없음. 달 파일이 둘 이상일 때만 달 선택이 나타난다.
7. **이름.** 데몬 모듈은 `spec-activity.ts`, 라우터 프로시저는 `spec.log`(쓰기, 경로)와 `spec.activity`(읽기, 프로젝트 id). 코드에서 "feed"는 제품어·폴더명으로만 쓴다(`spec-events.ts`의 `Feed`와 겹치지 않게).
8. **`shall log` 요약 관례.** `<무엇이 끝났나> — <Type> <n>, <Type> <n>…` 꼴. 선두 문구는 대화의 언어, 타입명은 `shall status`가 보고하는 대로(`Goal`, `UseCase`, `Requirement`, `WorkLog`…), 개수는 그 실행이 쓰거나 고친 id를 타입별로 센 것. 예: `스펙 도출 완료 — Goal 2, UseCase 3, Requirement 8`.
9. **`shall log --json`은 `{"ok": true}` 또는 `{"error": "…"}`** 한 객체, 실패 시 exit 1.
10. **호출 시점은 loop-ready 선언마다 1회.** /specify·/plan은 선언 직후(gated는 마지막 phase 뒤, `--auto`는 한 번의 승인 뒤), work는 기록 절차의 검사 뒤·안내 앞, raise는 착지 뒤. `--dry`·survey·help·착지 (d)는 로그하지 않는다. 실패는 한 줄로 말하고 정상 종료, 두 번 호출 없음, 되읽기 없음 — 플러그인의 네 스파인이 이 문장을 한 번씩 품는다.
