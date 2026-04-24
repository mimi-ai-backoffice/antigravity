# アーキテクチャ設計 — 接骨院・整体向け AI 統合運営パッケージ

本書は [`requirements.md`](./requirements.md) を前提に、技術的な構成と
モジュール境界、データモデル、AI エージェント設計を定義する。

---

## 1. 全体像

```
 ┌─────────────────────────────────────────────────────────────────┐
 │                        患者（Patient）                          │
 │   Web 予約 / LINE 予約 / スマホ事前問診 / 口コミ導線           │
 └───────────────┬────────────────────────────┬────────────────────┘
                 │                            │
                 │ HTTPS                      │ LINE Messaging API
                 ▼                            ▼
 ┌───────────────────────┐         ┌──────────────────────────┐
 │  Patient Web App      │         │  LINE Bot Gateway        │
 │  (Next.js App Router) │         │  (Webhook → Queue)       │
 └───────────┬───────────┘         └────────────┬─────────────┘
             │                                  │
             └──────────────┬───────────────────┘
                            ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │                   API Layer (Next.js Route Handlers)            │
 │   Auth / Rate Limit / Audit Log                                 │
 └──┬───────┬────────┬───────────┬────────────┬────────────────────┘
    │       │        │           │            │
    ▼       ▼        ▼           ▼            ▼
 ┌────┐ ┌──────┐ ┌───────┐ ┌────────┐ ┌──────────────┐
 │予約│ │問診AI│ │カルテ │ │会計・  │ │口コミ/再来DM │
 │    │ │      │ │       │ │ダッシュ│ │ (既存ツール) │
 └─┬──┘ └──┬───┘ └───┬───┘ └───┬────┘ └──────┬───────┘
   │       │         │         │             │
   ▼       ▼         ▼         ▼             ▼
 ┌─────────────────────────────────────────────────────┐
 │            Core Domain Services (TS)                │
 │  PatientService / VisitService / ChartService / ... │
 └──────────────────────┬──────────────────────────────┘
                        ▼
 ┌─────────────────────────────────────────────────────┐
 │   Postgres (primary)  +  Object Storage (S3)        │
 │   Vector DB (pgvector)  +  Event Queue (SQS/Inngest)│
 └─────────────────────────────────────────────────────┘

         ┌───────────────────────────────────┐
         │  AI Operations Agent (常駐)       │
         │  daily/weekly cron → ツール呼び出し │
         └───────────────────────────────────┘
```

---

## 2. 技術スタック

| レイヤ | 選定 | 理由 |
|---|---|---|
| フロントエンド（院長・患者） | **Next.js 16 App Router + TS + Tailwind v4** | 既存の puyo リポジトリと同スタック。SSR/RSC で SEO と速度を両立 |
| モバイル問診 | Next.js PWA（iPad 最適化） | 専用アプリを作らずに済む。初版はブラウザで十分 |
| バックエンド API | Next.js Route Handlers + tRPC | 型共有で開発速度。重い処理のみ Edge から Node ランタイムへ |
| DB | **Postgres (Supabase or Neon)** | RLS で院ごと分離、pgvector で問診類似検索 |
| ファイル/画像 | S3 互換（Cloudflare R2 / Supabase Storage） | 署名 URL で直アップ |
| 認証 | NextAuth + メール/LINE ログイン | 院長は Email、患者は LINE 優先 |
| AI | **Anthropic Claude (Sonnet 4.6 / Opus 4.7)** | 問診の自然対話・カルテ生成、赤旗検出 |
| AI 音声 | Whisper API or gpt-4o-mini-transcribe | 施術中の音声メモをカルテ化 |
| ジョブ/エージェント | **Inngest** or **Trigger.dev** | 定時タスク + LLM 呼び出しのリトライ制御 |
| 決済 | Stripe（自費）/ STORES 決済 | 日本でのカード受入実績 |
| LINE | LINE Messaging API | 予約・DM・口コミ導線 |
| 監視 | Sentry + Vercel Analytics + OpenTelemetry | |
| ホスティング | Vercel（初版）→ AWS ECS（スケール時） | |

### 2.1 なぜ Next.js 一択か

- 院長用管理画面・患者用フォーム・API を**単一リポジトリ**で完結できる。
- 小規模院のデータ量なら Next.js + Postgres で十分捌ける。
- チームが TS 一本化でき、AI エージェントの tool 定義も同じ型を共有できる。

---

## 3. モジュール構成（モノレポ想定）

```
antigravity/
├── apps/
│   ├── owner/          # 院長用管理画面（Next.js）
│   ├── patient/        # 患者用（問診/予約）Next.js
│   └── agent-worker/   # AI エージェントの常駐ジョブ（Inngest fn 群）
├── packages/
│   ├── db/             # Prisma schema + migration
│   ├── domain/         # ドメインロジック（Patient/Visit/Chart...）
│   ├── ai/             # Claude ラッパ、プロンプト、tool 定義
│   ├── ui/             # 共通 UI（shadcn ベース）
│   └── config/         # eslint, tsconfig, tailwind preset
└── docs/
    └── clinic-saas/    # 本ドキュメント群
```

> 初版は `apps/owner` と `apps/patient` を一つの Next.js アプリに統合しても良い
> （ルートセグメント `/o/*` と `/p/*` で分離）。運用が増えたら分割する。

### 3.1 ドメインモジュール（packages/domain）

- `PatientService` — 患者マスタ、同意取得、LINE 連携
- `VisitService` — 来院（問診 → 施術 → 会計）のステートマシン
- `IntakeService` — 問診（AI 対話 + 部位選択）
- `ChartService` — カルテ生成・差分管理・音声入力
- `BillingService` — 会計・レシート
- `ReviewService` — 口コミ依頼・導線・結果取り込み
- `RetentionService` — 離脱検知・再来 DM
- `AnalyticsService` — KPI 集計、AI 週次レポート
- `AgentService` — AI 運営エージェントのオーケストレーション

---

## 4. データモデル（主要エンティティ）

Prisma スキーマ断片イメージ（実装時に調整）。

```prisma
model Clinic {
  id           String   @id @default(cuid())
  name         String
  ownerUserId  String
  plan         Plan     @default(STANDARD)
  createdAt    DateTime @default(now())
  patients     Patient[]
  menus        Menu[]
  visits       Visit[]
}

model Patient {
  id           String   @id @default(cuid())
  clinicId     String
  clinic       Clinic   @relation(fields: [clinicId], references: [id])
  name         String
  kana         String?
  phone        String?
  lineUserId   String?  @unique
  dob          DateTime?
  sex          Sex?
  consentedAt  DateTime?
  visits       Visit[]
  createdAt    DateTime @default(now())
}

model Visit {
  id           String      @id @default(cuid())
  clinicId     String
  patientId    String
  reservedAt   DateTime
  startedAt    DateTime?
  finishedAt   DateTime?
  status       VisitStatus @default(RESERVED)
  intake       Intake?
  chart        Chart?
  billing      Billing?
  reviewAsk    ReviewAsk?
}

model Intake {
  id           String   @id @default(cuid())
  visitId      String   @unique
  bodyParts    Json     // [{region: "lowBack", side: "L", severity: 7}, ...]
  symptoms     Json     // [{type: "sharp", onset: "3d", trigger: "lifting"}, ...]
  history      Json     // 既往歴・服薬・妊娠等
  redFlags     String[] // 検出された赤旗タグ
  transcript   String   // AI との会話ログ（構造化前）
  aiSummary    String
  createdAt    DateTime @default(now())
}

model Chart {
  id           String   @id @default(cuid())
  visitId      String   @unique
  bodyParts    Json
  techniques   String[] // 使用手技（e.g., "PNF", "MT", "電気")
  assessment   String   // AI ドラフト + 院長編集
  plan         String
  voiceNoteUrl String?
  photos       String[] // S3 key
  editedById   String
  updatedAt    DateTime @updatedAt
}

model Billing {
  id           String   @id @default(cuid())
  visitId      String   @unique
  menuIds      String[]
  total        Int
  paymentKind  PaymentKind
  paidAt       DateTime?
  receiptUrl   String?
}

model ReviewAsk {
  id           String   @id @default(cuid())
  visitId      String   @unique
  channel      ReviewChannel // LINE | SMS | EMAIL
  sentAt       DateTime?
  openedAt     DateTime?
  clickedAt    DateTime?
  completedAt  DateTime?    // 口コミ投稿確認
}

enum Plan         { STANDARD PRO }
enum Sex          { M F OTHER }
enum VisitStatus  { RESERVED CHECKED_IN IN_PROGRESS DONE CANCELED NO_SHOW }
enum PaymentKind  { CASH CARD QR INSURANCE }
enum ReviewChannel{ LINE SMS EMAIL }
```

### 4.1 テナント分離（マルチテナント）

- すべての行レベルで `clinicId` を持ち、Postgres の **RLS（Row-Level Security）** で
  院ごとのアクセスを強制。
- ストレージ（S3）は `clinicId/` プレフィックスで分離し、署名 URL で配布。

---

## 5. AI 問診フロー設計

### 5.1 UX シーケンス

```
[患者、予約完了]
        │
        ▼
 ┌────────────────────────┐
 │ LINE: 問診 URL 配布    │
 └─────────┬──────────────┘
           ▼
 ┌────────────────────────┐   ┌─────────────────────────────┐
 │ 1) 基本情報フォーム     │──▶│ 2) 人体図タップで部位選択   │
 └────────────────────────┘   └─────────────┬───────────────┘
                                            ▼
 ┌────────────────────────────────────────────────────────┐
 │ 3) AI 対話（Claude） — 部位ごとに症状・強度・経過     │
 │    * ストリーミング UI                                  │
 │    * 赤旗検出 → 即時エスカレーション                   │
 └─────────────────────────────┬──────────────────────────┘
                               ▼
 ┌────────────────────────────────────────────────────────┐
 │ 4) 構造化サマリを生成し、院長側にプッシュ              │
 │    (Intake テーブルに保存、ChartService にドラフト送信)│
 └────────────────────────────────────────────────────────┘
```

### 5.2 Claude への役割分担

| ステップ | モデル | 役割 |
|---|---|---|
| 3) 対話聞き取り | **Claude Sonnet 4.6** | 安価・低レイテンシで自然対話 |
| 4) サマリ生成 | **Claude Opus 4.7** | カルテ下書きの質を最優先 |
| 赤旗検出 | ルール + Sonnet 4.6 | ルールで高リコール → LLM で文脈判定 |
| 週次レポート | Opus 4.7 | 院長への報告書はプレミアム品質 |

### 5.3 プロンプト方針

- **システムプロンプト**は JP 固定、口調はです・ます、
  「治る・治療」などの薬機法/あはき法グレー表現を出力しない制約を明記。
- Tool use で以下を呼び出す:
  - `record_body_part(region, side, severity)`
  - `record_symptom(type, onset, trigger, duration)`
  - `record_history(key, value)`
  - `raise_red_flag(reason)`
  - `finalize_intake()`
- **プロンプトキャッシュ**: 院の固定情報・過去来院サマリをキャッシュブロックに入れ、
  対話ターンごとの入力コストを抑える。

### 5.4 セーフティ

- 赤旗検出時は問診を中断し、画面に「医療機関受診を推奨」を表示 + 院長に即通知。
- AI の出力は**必ず院長の承認**を経てカルテに確定（自動確定はしない）。
- 会話ログは 5 年保持、PII マスキング済みコピーを学習評価に利用可（同意取得済みの場合）。

---

## 6. AI 運営エージェント設計

### 6.1 位置づけ

「常駐 AI スタッフ」として、院長が指示しなくても**毎朝/毎晩タスクを回す**エージェント。
ユーザーが望めばチャット UI からも対話可。

### 6.2 ツールセット（Claude Tool Use）

| ツール | 概要 |
|---|---|
| `list_todays_visits()` | 今日の予約一覧 |
| `list_churn_risk_patients(days)` | ○日来院していない患者 |
| `send_line_message(patientId, template, params)` | LINE 送信 |
| `draft_review_request(visitId)` | 口コミ依頼文の生成 |
| `summarize_weekly_kpi()` | KPI 集計 + コメント生成 |
| `propose_actions()` | 改善提案（新患減 → 広告文案、等） |

### 6.3 実行モード

- **提案モード（デフォルト）**: エージェントは案のみ提示、送信は院長が承認。
- **全自動モード（PRO プラン）**: 事前定義ルール内で自動送信（送信ログは常に残す）。

### 6.4 スケジューリング

- Inngest で以下を cron 登録:
  - 毎朝 8:00 — 今日のやることリスト生成 → 院長 LINE に push
  - 毎晩 21:00 — 当日来院者の口コミ依頼送信（opt-in）
  - 毎週月曜 9:00 — 先週の AI 週次レポート生成

---

## 7. セキュリティ・コンプライアンス

- **認証**: 院長 = Email + TOTP、患者 = LINE OAuth または電話番号 OTP
- **権限**: Clinic 単位の RBAC（初版は Owner/Staff のみ）
- **監査ログ**: カルテ閲覧・編集・エクスポートは全ログ化（5 年保持）
- **PII 暗号化**: 患者氏名・電話・生年月日は列レベル暗号化
- **バックアップ**: Postgres PITR 7 日 + 日次スナップショット 30 日
- **AI 入力の匿名化**: LLM に送る問診テキストは氏名・連絡先を除去した上で送信

---

## 8. 既存口コミツールの統合方針

1. 既存ツールのドメインモデル（レビュー依頼・導線・集計）を
   `packages/domain` の `ReviewService` に吸収。
2. 単品契約ユーザーは**そのまま使えるビュー**を維持しつつ、バックエンドは共通化。
3. 本パッケージ契約ユーザーには会計フロー後の**自動依頼トリガー**を追加して差別化。

---

## 9. デプロイ / 運用

- **環境**: `dev` / `staging` / `prod`、プレビュー環境は Vercel Preview
- **マイグレーション**: `prisma migrate deploy` を CI から実行、ブルーグリーン
- **機密情報**: Vercel Environment + Doppler（or 1Password CLI）
- **コスト見積（1 院あたり月）**:
  - Vercel + Postgres + S3: ~¥1,500
  - Claude API（問診 + エージェント）: **~¥3,000〜¥6,000**（想定来院 400/月）
  - LINE + Stripe: 変動
  - 粗利: 月額 ¥29,800 のプランで ~¥20,000/院

---

## 10. 未決事項 / 次のアクション

- [ ] 人体図の UI ライブラリ選定（自作 SVG か `react-body-highlighter` か）
- [ ] 柔整レセプトの扱い（Phase 2 でパートナー API と繋ぐか、自社実装か）
- [ ] マルチテナント DB を Supabase RLS でいくか、スキーマ分離か
- [ ] LLM コストのプラン別上限設計
- [ ] MVP 対象院との PoC 契約（2〜3 院想定）
