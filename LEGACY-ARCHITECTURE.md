# Legacy: Shall SaaS 아키텍처 · 테크 스택 요약

> **출처**: `~/dev/Nove-Shall-Meta/implementation-plan/` 의 [`01-architecture.md`](../Nove-Shall-Meta/implementation-plan/01-architecture.md) · [`02-tech-stack.md`](../Nove-Shall-Meta/implementation-plan/02-tech-stack.md) (2026-07-23 벤더 연구 기준 · 2026-07-31 마일스톤 축 폐기 개정 반영).
>
> **지위**: **레거시**. shall.sh를 멀티테넌트 SaaS로 개발하던 시기의 설계 문서이며, **구현은 완료되지 않았고 제품 구현은 삭제됐다**. 현 저장소(로컬 daemon + web)와는 다른 시스템이다 — 이 파일은 그 설계를 참조용으로 한 장에 압축한 것이지, 현 구현의 계약이 아니다. 대조는 §12.
>
> **범례(원문 3계급)**: **[확정]** 오너 확정 또는 요구가 강제 · **[제안]** 권고(요구 미강제, 게이트에서 확정) · **[재확인]** 커밋 시점 재검증 대상 벤더 사실 · **[승인 대기]** 오너 승인 훅이 걸린 편차.

---

## 1. 위상 — 단일 TypeScript 프로그램 **[확정]**

제품은 meta repo + product repo **총 2 repo**로 살고, SERVER는 **하나의 typed TypeScript 프로그램 = 단일 import 그래프**다.

이는 취향이 아니라 **whole-system count 요구**가 강제한다. "전체 시스템에서 정확히 N개"를 세는 명제는 시스템이 하나의 열거 가능한 프로그램일 때에만 정적으로 검증된다:

| 요구 | 명제 | 단일 열거가 필요한 이유 |
|---|---|---|
| **EL-N-006** | 제안 관문을 우회해 확정층에 앉는 쓰기 경로가 **정확히 하나**(사람 직접 저작·개정) | 확정층 쓰기 사이트 전체를 한 import 그래프에서 전수 열거 |
| **GR-N-004** | 실행층 append-only의 가변 칸이 **정확히 둘**(`Evidence.verdict`, `Question(e).state`) | 가변 셀 수는 전역 불변식 — 분할 프로그램은 "세 번째가 없음"을 증명 못 함 |
| **WS-N-006** | 등급→능력 유도가 **정확히 한 곳**, 소비자는 **4그룹** | 단일 정의 지점 + 소비자 폐쇄를 import reachability로 확인 |
| **WS-N-003** | 그래프-사실 계산 경로에 추론 **부재** | import reachability 정적 증명(§7) |
| **EL-N-009** | 표면 추가가 기존 표면 출력을 **불변** | 표면 집합 전체를 한 프로그램에서 열거해야 회귀 픽스처 성립 |

보편-부정 규칙(**DS-N-006** 임의-경로 탐색 부재 · **VC-F-029** · **BD-N-006**)은 분할해도 조합되지만, 카운트와 섞이면 **단일 열거가 이긴다**.

> **[제안]** 단일 프로그램 = **단일 소스·단일 감사 대상 import 그래프**이지 단일 배포가 아니다. 무거운 경로(미러 직렬화·nightly)는 **같은 import 그래프의 별도 entrypoint 배포**로 분리 가능 — 단 registry-walk·import-reachability 감사가 **모든 entrypoint를 열거·검사**하는 조건에서만. 1차 대응은 같은 런타임의 CPU cap 개방이고, 분리는 그것이 부족할 때의 옵션이다.

---

## 2. 세 배포체 **[확정]**

하나의 import 그래프를 세 형태로 배치한다.

| 배포체 | 내용 |
|---|---|
| **APPLICATION** | 다섯 entry surface + **arithmetic core**(낡음·전파·충족·배급·게이트·신호·계량·slicing 판정 산술 전량, `core/arith`) + **serialization core**(`(slice, convention) → bytes` 결정적 직렬화, `core/serialize`) |
| **TIME TRIGGER** | 상주 프로세스가 **아님**. scheduled-work endpoint를 두드리는 **인증된 외부 호출자**(cron). 앱 호스트에서 decouple — **BD-N-002**(무세션 커밋 수신)와 정합: 앱은 트리거 도착 시 깨어난다 |
| **PUBLISHED CLIENT** | CLI(파일시스템 writer) + 심는 에이전트 포장. **서버가 요구 버전을 소유**(**WS-F-017**). CLI는 **직렬화 0 · 산술 0** |

---

## 3. 다섯 entry surface + Verifier

**다섯 표면**: human web(사람) / agent MCP channel(에이전트) / mirror delivery(미러 인도) / commit-webhook intake(커밋 수신) / scheduled-work endpoint(정기 작업).

각 표면은 **surface registry에 principal/surface로 등록**되고, 실사용을 마주치는 시점에 stub → 실체로 뒤집힌다.

| 서브시스템 | 착지 내용(M 번호는 **주소이지 시점이 아님**) |
|---|---|
| **human web** | M1 Spec Planes 최소 캔버스 + 노드 상세 패널 → M5 Control Plane Review Queues → M9 Shall Vitals → **M10 SIGNUP + workspace provisioning**(M1~M9는 hand-provisioned 워크스페이스 전제) |
| **agent MCP channel** | M1 머신 토큰 인증 · read 1 · write 1 → M4 실행 쓰기 9종 → M7 `/shall-cycle-auto` 러너 소비 → M10 게시 planted-agent 포장 |
| **commit-webhook intake** | M1 registry 등록만(stub) → **M4 실체화**(HMAC signer principal · **BD-F-006** `(workspaceId, sha)` 원자 upsert). Evidence가 `CITES`→Commit으로 인용할 Commit이 그래프에 있어야 판정 경로(**SR-010** targetVersionAtLink 각인)가 성립하므로 M4가 최초 필요 지점 |
| **scheduled-work endpoint** | M4 skeleton(OQ 54 이벤트 유실 보정 대비) → M7 첫 실호출(러너 기동 시 on-demand 폴 · GitHub App **자체 delivery-history API** 조정 — 콘텐츠 read 아님, BD-N-001 무침해) → M9 일일 Vitals 크론의 무세션 상시 소비자 |
| **mirror delivery** | M1 stub → **M7 실체화**(결정적 렌더) |
| **Verifier (SR-035)** | 세 계기: **증거 제출 → M5**(승인 카드의 "Verifier 리포트" 슬롯 · DP-F-006 증언 결속) · **의미 변경 → M8** · **주기 스윕 → M9**. `VerificationReport`는 facts(1층 결정적) + opinion(2층 AI) 구조이며 **verdict 필드가 없다**(**VM-F-018** — 증언하되 판정하지 않음). **그래프 밖 실물 대조(VM-F-021)는 MVP 이연** — 저장소 READ 자격이 어느 요구로도 부여되지 않고 BD-N-001과의 정합 미검토라 능력 미부여로 vacuously 충족 처리 |

---

## 4. 내부 패키지 분해 **[확정]**

경계 규칙은 단 하나: **"이 패키지를 지우면 어느 승인 요구가 검증 불가가 되는가"**. 경계는 코드 취향이 아니라 요구 검증가능성이 긋는다.

```
packages/
  core/graph/        공통 메타 · 층 배치 · 불변성 · 연결시점버전 · 리비전
  core/arith/        낡음 · 전파 · 충족 · 배급 · 게이트 · 신호 · 계량 · slicing
  core/serialize/    (slice, convention)→bytes · 전순서 · 스탬프 · 배제
  core/tier/         등급→능력 SINGLE 유도
  core/credential/   추론 토큰의 유일 발급자
  core/surfaces/     principal/surface registry
  infra/inference/   추론 클라이언트를 import하는 유일 모듈
apps/
  surfaces/*         얇은 vendor 어댑터(web · mcp · webhook · mirror · scheduled)
  verifier/          T2 in-graph Verifier producer
client/
  cli/               직렬화 0 · 산술 0의 파일시스템 writer
```

| 패키지 | 지우면 검증 불가가 되는 것 |
|---|---|
| **core/graph** | GR 코어 전체(GR-N-003~007), 연결시점버전 각인(SR-007). **ImplementationTask는 Design 뷰의 상시(always-on) 노드라 여기 산다** |
| **core/arith** | 낡음(GR)·배급(DS)·충족·게이트·신호(VM)·계량 — 판정 트랙 전체. **infra/inference 도달 0**(§7 lint) |
| **core/serialize** | 미러 결정성(VC-N-001/002), convention freeze 골든 계약. **순수 함수(VC-N-003)** |
| **core/tier** | WS-N-006(정확히 한 곳) |
| **core/credential** | 추론 게이팅 전체 — token-as-argument의 발급 측(WS-F-011~016) |
| **infra/inference** | WS-N-003 + 아홉 무추론 NFR을 기계적 import-reachability lint로 성립시키는 소비 측. API가 credential 토큰을 **인자로 요구**해 게이트 없이 물리적 호출 불가 |
| **core/surfaces** | EL-N-006 열거, WS-N-007 표면별 격리 |
| **apps/surfaces/\*** | host-migration 비용 상한 — **호스트 런타임 API를 만지는 유일 층**(어댑터만 교체) |
| **verifier** | SR-035 증언 산물(WorkLog `SUBMITS` 소속 · `CITES`→Commit; verdict 필드 부재) |
| **client/cli** | VC-N-005/VC-F-007이 서버를 유일 직렬화자로 만듦 — CLI에 산술/직렬화가 있으면 붕괴 |

**infra/inference의 소비자**(추론이 서는 자리): M2 도출 · M3 check_consistency · M5 evidence-계기 Verifier · M8 개정 분류 · M9 sweep Verifier · 루프 T3. 자리가 늘어도 **게이트는 하나**(core/credential)이고 감사는 동일하다.

---

## 5. 저장 아키텍처

### 5.1 PostgreSQL + in-process computation kernel **[확정]**

커널이 **모든 판정 산술을 소유**하고, 엔진은 판정 경로에 **ORDER BY / 재귀 / 집계를 제공하지 않는다**. 결정 사유는 성능이 아니라 **검증가능성**이다:

- 다섯 NFR(**GR-N-003 · DS-N-002 · VC-N-005 · GR-N-004 · VM-F-018**)이 **"스키마에 슬롯이 없음을 확인"**으로 검증된다. schemaless 저장소는 "충족 슬롯 부재"를 **증명 불가 부정**으로 만든다.
- **그래프 DB 기각**: 그래프 DB의 가치인 **임의-경로 질의를 DS-N-006 · VC-F-029가 제품 기능으로 금하고**, VC-F-021이 순회 반환 순서 의존을 금한다. 제품이 금지한 능력을 위해 저장소를 고를 이유가 없다.

### 5.2 스키마 형태 **[확정]**

```
nodes             23 노드 타입 (본체 20 + 위성 3)
edges             33 엣지 타입 · 2 sink(Term · Commit) · 타입수준 DAG를 데이터로 인코딩
edge_type_pairs   정적 문법 테이블 · FK 강제 · v5 Node Relation Table을 시드
                  · 새 엣지는 위상정렬 재검증 통과 필수
+ 12개 비노드 1급 테이블:
  node_revisions · evidence_verdict_log · disposition_record · graph_vitals
  WorkClaim · OperatingDirective · DefectReport · workspace · ...
```

**append-only + "가변 칸 정확히 둘"**(`Evidence.verdict` via `evidence_verdict_log` · `Question(e).state`)을 **불변층 테이블 스코프 BEFORE UPDATE/DELETE 트리거**로 강제한다(GR-N-004).

### 5.3 계산 필드 함정 — 저장하면 안 되는 것 **[확정]**

레퍼런스 스키마가 노드 attribute로 열거한 것 중 일부는 **판정 트랙의 재계산 투영이지 영속 컬럼이 아니다**. 실컬럼으로 물화하면 불변식이 조용히 붕괴한다.

| 필드 | 실제 취급 | 근거 · 감사 |
|---|---|---|
| **REQ.fulfillment** | **영속 컬럼 금지 — 매 read 재계산** | GR-N-003 · GR-F-026 · 충족 계산 규칙 **ST-1·ST-2**("충족은 저장이 아니라 계산"). `nodes` 스키마에 fulfillment 슬롯 부재를 M1 스키마 생성 감사로 못 박음 |
| **ImplementationTask.touches[] / conflicts_with[]** | **긴장** — 레퍼런스는 lease 안정성 근거로 노드 저장을 명시하나 GR-N-003과 부딪힘 | **M6 게이트에서** (노드 스코프 캐시 + 재계산 동일성 불변식) 또는 (조회 시점 계산) 중 확정. 어느 쪽이든 **board 배급 결과(DS-N-002)는 저장 안 함** |

> **Task는 렌즈**: touches/conflicts를 어떻게 저장하든 **AC 충족 계산은 Task의 존재를 참조하지 않는다**.

### 5.4 불변 바디 저장 vs 불변식 9 화해 **[승인 대기]**

- **[제안]** 큰 바디(리비전 스냅샷 · 증언 텍스트)는 **content-hash object storage**(불변 · 해시 주소 — VC-N-002 보존)에, **메타데이터 행은 PG**에.
- **⚠ 편차**: CLAUDE.md §1 **불변식 9(Postgres-only / 단일 저장소)**의 문자 그대로와 부딪히고 **"떠나기 = dump/restore"** 서사를 약화시킨다. **무표시 확정 금지 — M1 게이트에서 오너 승인**을 지난다.
- **화해안**: 불변식 9는 **판정·그래프 저장소**를 지배한다(Postgres-only — graph DB · schemaless · 판정 경로 위 제2 질의 엔진 금지). 불변 콘텐츠-주소 blob은 **판정 경로 밖의 최적화**이며, 이탈 서사는 **"PG dump + blob export"**로 재범위화.
- **대안**(문자 그대로의 단일 저장소 고수 시): 바디를 **PG `bytea` / large object**에 보관해 dump/restore를 단일 명령으로 유지(DB tier egress·용량 비용 감수).
- **[제안] MVP 절충**: PG-only + **바디 크기 상한 명시**로 시작, 상한 초과가 실측되면 blob 도입(도입 시 복구 절차 문서화).

### 5.5 벡터 확장 없음 **[확정]**

base 스키마·질의는 **확장-free**. 유사도는 오늘 승인-요구 수요 0. `pgvector`는 **OQ 68 확정 시에만 파생-캐시 테이블**로(base는 확장-free 유지 → "떠나기 = dump/restore"가 참으로 남음).

---

## 6. DB 드라이버 규율 **[확정]** — day-1부터, free/paid 불문

- **쓰기는 WebSocket/TCP 드라이버로 고정** — Neon serverless WebSocket 또는 Hyperdrive+`pg`. Neon HTTP 드라이버는 단건 query와 non-interactive 트랜잭션까지 지원하지만([재확인]), gate·dispatch·ledger 쓰기 경로는 **interactive 트랜잭션 · 세션 문맥(`pg_advisory_xact_lock`) · node-postgres 호환**을 요구한다(**DP-N-004** 원자 전이+기록 · **DS-F-016** 원자 claim · **VC-N-002** 직렬화 원자성). HTTP 경로의 read-only/non-interactive 한정 사용 허용 여부는 **M1 게이트 별도 결정**.
- **원자 claim은 `pg_advisory_xact_lock`** — **트랜잭션 스코프**(세션 스코프 아님), DS-F-016.
- **커넥션·풀 수명 규율**: Workers에서 WebSocket `Pool`/`Client`는 요청 밖 유지 불가 → **핸들러 안 connect/use/close, 전역 싱글턴 Pool 금지**. pooled(PgBouncer transaction mode) 경로에서 세션 의존(`SET` · `LISTEN` · 세션 커서 · prepared statement · temp table 보존 · 세션 스코프 advisory lock) **금지** — lint/SQL 리뷰 체크리스트 대상.
- 로컬 direct-connect 통과는 **불충분** — **실-Neon pooler acceptance test**가 배포 전 필수(§10).

---

## 7. 추론 플레인 배치 **[확정]**

판정에 AI 불포함(CLAUDE.md §1.1)을 **기계적으로 강제**하는 배치다.

- **core/credential**이 추론 토큰의 **유일 발급자**(WS-F-011~016).
- **infra/inference**가 토큰을 **인자로 요구하는 유일 소비 모듈** — 게이트를 통과하지 않은 코드 경로는 **물리적으로 추론을 호출할 수 없다**.
- 이 **token-as-argument 설계** + **"core/arith → infra/inference import 금지" lint**가 모든 추론 사이트를 게이트 밖 도달 불가로 만든다. WS-N-003과 아홉 무추론 NFR이 사람 감사가 아니라 **기계적 import-reachability lint**가 된다.
- **추론 호출은 착지 트랜잭션 밖**(**EL-N-005**는 원자 **착지**를 요구하지 원자 **호출**이 아님 — LLM 왕복 동안 pooled backend 미점유).
- **판정 트랙 → 계량 서브모듈의 유일 허용 read**는 **VM-F-027 한도 소진 재계산**뿐(M7 소비자). 그 외 판정→계량 import는 **M9 순수-sink 감사**가 금지(계량은 무되돌림 read-sink · VM-F-028).

---

## 8. 감사 하네스 — 2026-07-31 개정

> **⚠ 폐기된 자세**: "day-1에 감사 하네스를 통째로 세우고 이후 각 마일스톤이 공허 감사 하나씩을 real로 뒤집는다"는 설계가 **오너가 진단한 인지부채의 직접 원인**이었다 — 여러 사이클 동안 대부분의 규칙이 공허한 채 통과했고, **공집합 위의 규칙은 안전장치가 아니라 green으로 읽히는 설계 문서**였다. M1~M10 마일스톤 축이 폐기되고 제품 구현이 삭제됐다.

**대체 규칙**:

1. 감사 규칙은 자기가 구속하는 것의 **두 번째 인스턴스와 함께** 착지하며 **첫 번째보다 앞이 아니다**. 유일 예외: 부재를 단언하는 **negative schema assertion은 즉시 real**.
2. 검사는 불리언이 아니라 **INACTIVE / DEGENERATE / REAL 3상태**를 보고한다. 앞의 둘은 게이트를 빨갛게 만들지 않으며 **통과로 읽히지도 않는다**.
3. 게이트는 **래칫 표**다 — 비어서 시작하고, 검사 기계를 추가하는 슬라이스마다 한 줄씩 자라며, 없는 레그는 **없다고 인쇄되지 green으로도 n/a로도 인쇄되지 않는다**.

**결국 서야 하는 감사 재고 목록**(각각 자기 대상의 두 번째 인스턴스가 착지하는 슬라이스에 온다):

- **surface registry** + **registry-walk 감사 스켈레톤**
- **"core/arith → infra/inference import 금지" lint**
- **"core/serialize purity" lint** — Date / randomness / env / 저장소 반환 순서 의존 부재
- **WebSocket/TCP 드라이버 규율** + `pg_advisory_xact_lock` 골격
- **reference-sync 감사** — META의 v5 그래프 문법(노드·엣지 타입·방향·카디널리티) ↔ `edge_type_pairs.seed.sql` ↔ `core/graph` 타입의 동형성 diff
- **커넥션 수명 규율 lint**(§6)
- 두 회귀: **"모든 생성 엣지의 ordinal 키 non-null"**(VC-F-021 침묵 실패 방지) · **"nodes 스키마에 fulfillment 슬롯 부재"**(GR-N-003 위반 방지)

**상시성 두 건**:

- **EL-N-006은 straddle 감사** — M2에서 사람-직접 확정층 쓰기 경로 등장으로 **부분 real**, M5에서 승인 착지 경로가 M2 잠정 confirm 경로를 대체·폐기하며 **전수 열거 완성**.
- **WS-N-007(멀티테넌트 격리)은 잠자지 않는다** — 합성 외래 workspaceId를 각 읽기·쓰기 표면에 주입하는 **런타임 교차-tenant 테스트를 상시 real**로 굴리고, 표면이 새로 설 때마다(webhook · 결함/Verifier · mirror · scheduled) 그 표면의 격리를 재검증. 진짜 위험은 "M10까지 vacuous"가 아니라 **"새 표면이 격리 재검증 없이 추가되는 것"**이며, M10의 두 번째 실tenant는 첫 fire가 아니라 **회귀 확인**이다.

---

## 9. Schema corrections — 스키마 생성 시점부터 강제 **[확정]**

레퍼런스 스키마와 승인 모델 사이의 틈 여섯 곳. 놓치면 **직렬화·낡음이 침묵하며 붕괴**하므로 발견 시점의 마일스톤이 아니라 **스키마 생성 시점부터** 데려간다.

| # | 교정 | 근거 / 붕괴 위험 |
|---|---|---|
| (a) | **RELATIONSHIP ordinal identity key + 채움 시점** — byte-comparable ordinal key 컬럼을 스키마에 추가하되 **값은 최초 엣지 insert부터 매 insert 시 결정적으로 채운다** | **VC-F-021**. 컬럼만 있고 값이 null이면 직렬화에서 **전순서가 조용히 붕괴** → "엣지 ordinal 키 non-null" 회귀를 상시 |
| (b) | **`COLLATE "C"`** — 정렬·비교는 ordinal 키 또는 `COLLATE "C"`로만 | **VC-N-003**. libc/ICU **collation drift**가 결정적 직렬화(같은 그래프 = 같은 바이트)를 깬다 |
| (c) | **VC-F-013 스탬프는 관계 삽입 반영** | 관계만 바뀐 두 그래프가 같은 스탬프면 안 됨 — 관계 insert가 노드 version을 안 움직여도 바이트는 바뀐다 |
| (d) | **추론 호출은 착지 트랜잭션 밖** | **EL-N-005**는 원자 착지를 요구하지 원자 호출이 아님 |
| (e) | **`REQ.fulfillment` 비컬럼** | **GR-N-003 · GR-F-026 · ST-1·ST-2**. 계산 필드 물화 위반을 스키마 생성 감사로 잠금 |
| (f) | **`ImplementationTask.touches[]` / `conflicts_with[]` — M6 확정** | **GR-N-003**과의 긴장. 캐시+재계산 동일성 vs 조회 시점 계산 중 오너 확정. **board 배급 결과(DS-N-002)는 어느 쪽이든 무저장** |

---

## 10. 벤더 스택 **[재확인]** — 2026-07-23 연구 기준, 배포 전 재검증 필수

| 계층 | 선택 | 핵심 사실 |
|---|---|---|
| **DB** | **Neon Free, AWS 리전** | Auto-suspend + 다음 연결 시 **auto-resume** → **BD-N-002**(무세션 webhook 수신) 통과. 일반 플랜 미활동 삭제 없음 → VC-F-030/N-006/N-005 통과. **⚠ 반드시 AWS 리전** — 유일하게 문서화된 미활동-삭제는 **deprecated Azure 리전**(2026-10-05 발효)이며 AWS를 명시 제외. 수치: 0.5 GB storage/project · 100 CU-hours/월 · egress 5 GB/월 · 5분 idle 후 scale-to-zero |
| **앱 호스트** | **Cloudflare Workers FREE → Paid $5/월** | Free의 **10ms CPU-time cap**(CPU 과금, DB 대기 미포함)은 짧은 I/O-bound 트랜잭션(DP-N-004)엔 충분하나 **CPU-bound mirror 직렬화**(VC-N-002/010, 회전당 2회, 저장본 없음)를 **죽인다**. **1차 대응은 같은 런타임에서 CPU cap 10ms → 5min 개방** — 즉 **Paid 이동 타이밍(M7 미러 실물화) = 원가 발생 타이밍**. runtime acceptance 목록: compressed bundle size 상한 · startup time 상한 · 128MB memory · request당 outgoing connection 수 · Cron/Queue CPU 한도 |
| **Cron** | **Cloudflare Cron Triggers 또는 GitHub Actions** | scheduled-work endpoint를 호출. **앱 호스트 선택 사유가 아니다** — decoupled |
| **Object storage** | **R2 등 egress-free** | 리비전/증언 바디용. **채택은 §5.4 불변식 9 화해 승인에 종속** |
| **GitHub App** | `metadata` + `contents:read` + `webhook` | **repo 쓰기 없음**(BD-N-001 설치 시점 강제). org repo는 admin 승인 흐름이 별도 액터일 수 있음(OQ 4) |

**기각된 대안**: **Supabase** — 1주 후 pause → 수동 restore가 BD-N-002 실패, 90일 후 삭제. 번들 auth도 5 principal 중 1만 커버하며 가장 끈적한 데이터에 lock-in. · **Vercel Hobby** — Fair Use Guidelines가 상업 이용 전면 금지. · **Deno Deploy** — 진짜 $0 대안(15 CPU-hours/월, per-request CPU cap 없음)이나 **3검증 대기**: (1) 상업 이용 허가, (2) per-request wall-clock, (3) Postgres raw TCP.

### 커밋-시점 체크리스트 (배포 전 필수)

- [ ] Neon **AWS 리전** 프로비저닝 확인(Azure 아님) + 무삭제 약관 재확인
- [ ] Cloudflare Workers Free 10ms / Paid 5min cap 현행 수치 재확인
- [ ] (Deno 채택 시) 상업 이용 · per-request wall-clock · raw TCP 3검증
- [ ] WebSocket/TCP 경로에서 **interactive 트랜잭션 + `pg_advisory_xact_lock`** 실동작
- [ ] **Workers runtime 한도**(bundle · startup · memory · connection) 재확인
- [ ] **실-Neon pooler**에서 DP-N-004 / DS-F-016 / BD-F-006 acceptance test 재실행 (로컬 direct-connect 통과 불충분 — CI `@needs-neon-pooler` 태그)
- [ ] R2(또는 대안) egress 약관 + §5.4 오너 승인 상태 확인
- [ ] GitHub App 권한이 무쓰기(BD-N-001)인지 설치 매니페스트 재확인

---

## 11. 그 외 확정·제안

### 인증 — 다섯 principal **[확정]**

`human owner` / `agent` / `verifier` / `commit-webhook signer` / `internal trigger`.

- **머신 principal 셋**(토큰 발급 · HMAC 검증 · 내부 토큰)은 **어떤 DB 선택과도 무관하게** 빌드한다 — 번들 BaaS auth(GoTrue류)는 human web login 1개만 커버.
- **Human 로그인**은 자체 JWT 발급 또는 전용 provider — **DB 선택과 decouple**.
- 최소 권한 모델 = 단일 owner + 5 principal(OQ 59 최소치) — M1 게이트 확정 대상.

### GitHub App 무쓰기 **[확정]**

webhook 수신 전용. **미러 커밋은 러너가 쓴다**(App이 아니라). 커밋 사실은 **webhook 도착으로만 물화** — **MCP 커밋-쓰기 도구는 존재하지 않는다**.

### 로컬-우선 개발 **[확정]**

대부분의 작업은 **로컬 Postgres**에 대해 돈다. 클라우드가 진짜 필요한 곳은 둘뿐: **GitHub webhook 수신**(개발 중 `smee.io`/`cloudflared` 터널)과 **always-on trigger**(로컬 크론 또는 수동). 단 **원자성 acceptance test는 실-Neon pooler에서 배포 전 필수**.

### 프런트엔드 **[제안]** — 게이트에서 오너 확정

| 항목 | 권고 | 대안 / 경고 |
|---|---|---|
| **그래프 캔버스** | **React Flow**(`@xyflow/react`, MIT) 1차 + **제한 lens 렌더**(선택 노드 주변 1~2 hop · stale 영향 반경 · Task→AC→Evidence 사슬). **y-밴드 레이어 + 층 내 자유 배치**(DAG 정합) 유지 | **Sigma.js는 지금 채택하지 않음** — 대형 네트워크 분석 화면 수요 실증 시 재검토. CLAUDE.md §4의 "React Flow + Sigma.js"는 **NOT BINDING 초안** |
| **웹 프레임워크** | **Workers-native 경량 라우팅(예: Hono) + React SPA 대시보드** (tRPC는 타입 안전 RPC로 선택적) | **⚠ CLAUDE.md §4의 "Next.js + tRPC"는 NOT BINDING 초안** — 단일 프로그램이 Workers/Deno에서 돌아야 하는 제약과 Next.js full-stack의 무게가 충돌. Next.js 고수 시 앱 호스트 제약 재검토가 선행 |
| **SPA 초기 확인 목록** | ① 핵심 화면(게이트 거부 · Verifier 증언 · 배급 상태)의 **stale-data 처리** ② **WebSocket·SSE vs polling** ③ auth·세션 만료 시 **MCP·API·UI의 일관된 실패 표현** ④ 보드 화면 **접근성·키보드 내비게이션** | — |

### 추론 모델 **[제안]**

**내장 소형 모델**(도출·evidence-계기 Verifier T2 — 시스템 자기조달, 등급 한도·DS-F-035 집행) + **BYO 키**(검수 T3 · 루프). 단 **`core/credential`(토큰 유일 발급자 · token-as-argument)은 [확정]**.

### 명칭 통일 **[제안]**

`claim_tasks` ↔ `open_worklog`, `replan` 타입명, `design` ↔ `propose_design`, `verify_module` 표 편입을 **M6/M7 게이트에서 일괄 확정**. M7 러너가 이 이름들을 하드코딩 계약으로 삼으므로 **착수 전 동결**.

### 성능 — 계측-only **[확정]**

- **요구는 latency · concurrency · retention 수치를 주지 않는다. 따라서 발명하지 않는다.**
- 성능은 오직 **계측**으로만 다룬다 — 측정하되 목표 수치를 스택 결정의 근거로 삼지 않는다.
- 호스팅 결정의 근거는 항상 **검증가능성**이었다: Workers CPU cap이 문제인 이유는 "느려서"가 아니라 **CPU-bound 직렬화가 물리적으로 못 끝나서**다 — 성능 목표가 아니라 **동작/부동작 경계**.
- **[제안] 운영 guardrail**: 벤더 runtime 한계에서 **유도되는** internal kill threshold(CPU/memory/query-count)와 workspace 규모별 board·vitals·직렬화 비용 실측은 M7/M10 전 확정. 수치는 발명하지 않고 벤더 한도에서 유도한다.

---

## 12. 현 저장소와의 대조 (오리엔테이션용, 결정 아님)

| 축 | 레거시 SaaS 설계 | 현 저장소(M0) |
|---|---|---|
| 배치 | Cloudflare Workers 멀티테넌트 SaaS + Neon Postgres | 로컬 daemon(`~/.shall/`) + web, 프로젝트별 `.shall/` |
| 저장 | PG `nodes`/`edges`/`edge_type_pairs` + 12 비노드 테이블 | 파일 기반(`config.json` · `project.json` · 로컬 registry) — 스펙 그래프 미구현 |
| 테넌시 | workspace + 5 principal + WS-N-007 교차-tenant 격리 상시 검증 | 단일 사용자 로컬, 테넌시 개념 없음 |
| 표면 | 5 entry surface(web · MCP · webhook · mirror · scheduled) + Verifier | web UI(Control/Spec/Settings 셸) |
| 프런트 | [제안] React Flow + Workers-native 라우팅 | shadcn/ui + Tailwind v4 |

**로컬 구현에도 그대로 유효한 것들**(배치와 무관한 설계 명제):
단일 import 그래프의 whole-system count · 판정 산술과 추론의 물리적 분리(token-as-argument) · "충족은 저장이 아니라 계산" · 결정적 직렬화와 ordinal key/`COLLATE "C"` · append-only + 가변 칸 정확히 둘 · CLI 무산술·무직렬화 · **감사 규칙은 두 번째 인스턴스와 함께 착지하고 INACTIVE/DEGENERATE/REAL 3상태로 보고한다**.

**배치에 종속돼 재론이 필요한 것들**: 호스팅·벤더 약관 전량(§10) · WebSocket/TCP 드라이버 규율과 커넥션 수명(§6, Workers 제약에서 유도) · decoupled cron · GitHub App/webhook 수신 · object storage 편차(§5.4).
