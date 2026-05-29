# Issue Board

店舗で発生した問題点を登録し、関係者で情報共有しながら、解決策の検討・実行・完了までの流れを管理するためのアプリです。

## 概要

Issue Board は、店舗運営の中で発生した課題や問題点を記録し、対応状況を可視化するための社内向けアプリです。

問題の登録だけで終わらず、次の流れを一貫してサポートします。

- 問題点を Issue として登録する
- コメントで状況や対応案を共有する
- 誰が確認したかを記録する
- admin が確認済みユーザーの中から解決者を設定する
- 期限の迫った Issue について担当者へリマインドをする
- 対応完了後に解決済みにする
- 操作履歴を監査ログとして残す

## 主な機能

- ログイン / ユーザー登録
- Issue の作成
- Issue 一覧表示
- Issue 詳細表示
- Issue の編集 / 削除
- コメント投稿
- 確認チェック（見ました）
- 解決担当者の設定
- Issue の解決 / 未解決切り替え
- 監査ログの記録 / 閲覧
- メール通知
- 期限３日前 / 期限当日のリマインドメール
- aiによる文章整形(Issue本文 / コメント / 編集)
- ロールによる権限制御

## 想定利用シーン

- 店舗で発生したトラブルの共有
- 設備やオペレーション上の改善点の記録
- 対応漏れの防止
- 誰が確認・対応したかの可視化
- 担当者の明確化
- 過去の対応履歴の振り返り

## 技術構成

### Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS
- Supabase JavaScript Client

### Backend

- Hono
- TypeScript
- Supabase
- Zod
- Nodemailer
- OpenAI API

## 構成

```text
issue-board/
├─ apps/
│  ├─ web/          # Next.js フロントエンド
│  │  ├─ app/
│  │  ├─ components/
│  │  └─ lib/
│  └─ api/          # Hono API
│     ├─ src/
│     │  ├─ routes/
│     │  ├─ middleware/
│     │  └─ lib/
├─ package.json
└─ README.md
```

## 権限

ロールごとに利用できる機能が異なります。

| 機能 | admin | member | viewer |
|------|:-----:|:------:|:------:|
| Issue 一覧 / 詳細閲覧 | ✅ | ✅ | ✅ |
| Issue 作成 | ✅ | ✅ | ❌ |
| Issue 編集 | ✅ | ❌ | ❌ |
| Issue 削除 | ✅ | ❌ | ❌ |
| Issue 解決 / 未解決切り替え | ✅ | ✅ | ❌ |
| コメント投稿 | ✅ | ✅ | ❌ |
| コメント閲覧 | ✅ | ✅ | ✅ |
| コメント削除 | ✅ | ❌ | ❌ |
| 確認チェック | ✅ | ✅ | ✅ |
| 解決担当者設定 | ✅ | ✅ | ✅ |
| 監査ログ閲覧 | ✅ | ❌ | ❌ |

## 画面一覧

| パス | 説明 |
|------|------|
| `/` | 認証状態に応じて /login または /issues　に振り分ける入口ページ |
| `/login` | ログイン画面 |
| `/register` | 新規登録画面 |
| `/issues` | Issue 一覧画面 |
| `/issues/[id]` | Issue 詳細画面 |
| `/admin/audit-logs` | 監査ログ画面 |

## API 概要

### 共通

```
GET  /health
GET  /me
```

### Issues

```
GET    /issues
POST   /issues
GET    /issues/:id
PATCH  /issues/:id
DELETE /issues/:id
PATCH  /issues/:id/resolve
PATCH  /issues/:id/assignee
```

### Comments

```
GET    /issues/:id/comments
POST   /issues/:id/comments
DELETE /issues/:issueId/comments/:commentId
```

### Checks

```
GET  /issues/:id/checks
POST /issues/:id/check
```

### Audit Logs

```
GET /issues/:id/audit-logs
```

> 別途、全体監査ログ取得用ルートあり

### AI

```
GET /ai/test
POST /ai/format-text
```

### internal
```
GET /internal/reminders/run
```
/internal/reminder/run は Cron/手動実行用の内部ルートです。

## バリデーション

### Issue 作成 / 更新

| フィールド | 制約 |
|-----------|------|
| `title` | 必須、1〜100文字 |
| `description` | 必須、1〜2000文字 |
| `dueDate` | 任意、ISO 形式の日付 |

### コメント

| フィールド | 制約 |
|-----------|------|
| `comment` | 必須、1〜1000文字 |

## データベース構成

主なテーブルは以下です。

| テーブル | 説明 |
|---------|------|
| `profiles` | ユーザー情報。ロールや表示名を保持 |
| `issues` | 問題点の本体。タイトル、詳細、状態、期限、作成者、解決者などを保持 |
| `issue_comments` | Issue に対するコメント |
| `issue_checks` | Issue を確認したユーザーの記録 |
| `audit_logs` | 操作履歴の記録 |

関係としては、`issues` は `profiles` に作成者・解決者として紐づき、`issue_comments` と `issue_checks` は Issue と User に紐づきます。`audit_logs` は、どのユーザーがどの対象に何をしたかを記録します。

## 認証 / 認可

- 認証には Supabase Auth を使用
- フロントエンドで取得したアクセストークンを API に Bearer Token として送信
- API 側でユーザー情報を取得し、ロールに応じてアクセス制御を実施
- フロントエンドではみログイン時に /login へ誘導
- 詳細ページなどへ直接アクセスした場合にも、ログイン後に元のページへ戻れるよう対応

## 通知

以下のタイミングでメール通知を送信する構成です。

- Issue 作成時
- Issue を解決済み / 未解決に変更した時
- adminが解決担当者を設定した時
- 解決担当者の期限３日前
- 解決担当者の期限当日

## リマインド
期限付き Issue のうち、解決担当者が設定されているものを対象に、以下のタイミングでリマインドメールを送信します。

- 期限の3日前
- 期限当日

内部 API /internal/reminders/run をVercel Cron Job から実行する構成です。
また、手動実行用の認証ヘッダーにも対応しています。

AI 文章整形
OpenAI API を利用して、以下の入力欄で文章整形を行えます。
- Issue 作成フォーム
- Issue 編集フォーム
- コメント投稿フォーム

入力した内容をそのまま上書きするのではなく、整形案を表示し、必要に応じて採用できるUIにしています。


## 監査ログ

主要な操作は監査ログとして保存されます。

- Issue 作成
- Issue 更新
- Issue 削除
- Issue 解決 / 再オープン
- コメント作成
- コメント削除
- 確認チェック
- 担当者設定

## セットアップ

### 1. リポジトリを clone

```bash
git clone https://github.com/yasunarj/issue-board.git
cd issue-board
npm install
```

### 2. 環境変数を設定

**apps/web/.env.local**

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_API_BASE_URL=http://localhost:8787
```

**apps/api/.env**

```env
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
MAIL_USER=your_mail_address
MAIL_APP_PASSWORD=your_mail_app_password
NOTIFY_TO=notification_destination
OPENAI_API_KEY=your_openai_api_key
APP_BASE_URL=http://localhost:3000
CRON_SECRET=your_cron_secret
INTERNAL_API_SECRET=your_internal_api_secret
PORT=8787
```

### 3. 開発サーバーを起動

**Web**

```bash
npm run dev:web
```

**API**

ルートディレクトリから実行する場合:

```bash
npm --workspace apps/api run dev
```

または `apps/api` に移動して実行:

```bash
cd apps/api
npm run dev
```

### 4. 動作確認

- Frontend: http://localhost:3000
- API: http://localhost:8787

## テスト
API 側では Vitest を利用してルート単位のテストを実施しています。

主に以下のを確認しています。

- Issue CRUD
- コメント作成/取得/削除
- 確認チェック
- 解決/再オープン
- 監査ログ
- Internal reminder
- AI 整形 API

## 開発メモ

- API は Hono で構成
- 認証後に role を取得して権限制御を実施
- 監査ログを残すことで、後から操作履歴を確認可能
- 店舗運営で発生する問題を「登録 → 共有 → 対応 → 完了」まで追えるようにしている

## 今後の改善候補

- [ ] README に画面キャプチャを追加
- [ ] セットアップ手順の自動化
- [ ] DB 作成 SQL の掲載
- [ ] デプロイ手順の追加
- [ ] テスト方針の追記
- [ ] UIの細かな改善

## AWSの機能実装
- [ ] S3画像添付機能
- [ ] Lambdaでサムネイル生成
- [ ] CloudWatch LogsでLambdaログ確認
- [ ] issue_attachments に thumbnail_s3_key を追加
- [ ] フロントで一覧表示はサムネイル、クリックで原寸画像
- [ ] EventBridge + Lambdaで不要S3ファイル掃除
- [ ] 必要ならCloudFront



