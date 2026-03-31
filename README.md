# 医療面接 AI評価システム

柔道整復学科の臨床実習における医療面接をAIが自動評価し、教員との振り返りを支援するセルフチェックシステムです。

## 概要

学生が実施した医療面接の文字起こしテキストを、AI（Claude Sonnet 4.6）が教科書準拠の評価基準に基づいて自動判定します。

### 主な機能

- **3段階の評価レベル**: Level 1（入門・10項目）/ Level 2（基本・30項目・100点満点）/ Level 3（応用・68項目）
- **自己評価 x AI評価のギャップ分析**: 自己認識のズレを可視化
- **教育的配慮**: 低スコアでも「成長中」表記、できた点を先に褒める設計
- **匿名化自動化**: Plaudカスタムテンプレートで個人情報を自動匿名化
- **メール送信**: 評価結果を学生のメールアドレスに送信
- **API使用量ダッシュボード**: トークン使用量・コストをリアルタイム表示

## 技術スタック

| 項目 | 技術 |
|------|------|
| 録音・文字起こし | Plaud Note Pin + Plaudアプリ（カスタムテンプレート） |
| AIエンジン | Claude Sonnet 4.6（AWS Bedrock） |
| バックエンド | Google Apps Script（GAS） |
| フロントエンド | GAS WebApp（HTML Service） |
| データベース | Google Sheets |
| メール送信 | GmailApp.sendEmail() |

## セットアップ

### 1. GASプロジェクト作成

1. [Google Apps Script](https://script.google.com/) で新しいプロジェクトを作成
2. `gas-project/` 内の各ファイルをGASエディタにコピー
   - `.gs` ファイル → スクリプトファイルとして追加
   - `.html` ファイル → HTMLファイルとして追加

### 2. AWS Bedrock APIキーの取得

1. [AWS Bedrock コンソール](https://console.aws.amazon.com/bedrock/) にログイン
2. Claude Sonnet 4.6 のモデルアクセスを有効化
3. APIキー → 長期APIキーを生成

### 3. Google Sheetsの準備

新しいスプレッドシートを作成し、以下の2シートを用意：

**学生マスター シート**

| A列 | B列 | C列 |
|-----|-----|-----|
| 学生番号 | 学生氏名 | メールアドレス |

**評価履歴 シート**（空のまま。システムが自動でヘッダーを追加）

### 4. スクリプトプロパティの設定

GASエディタの「プロジェクトの設定」→「スクリプトプロパティ」に以下を追加：

| プロパティ名 | 値 |
|-------------|-----|
| `BEDROCK_API_KEY` | AWS Bedrockの長期APIキー |
| `SPREADSHEET_ID` | GoogleスプレッドシートのID |

### 5. デプロイ

1. 「デプロイ」→「新しいデプロイ」→「ウェブアプリ」
2. 次のユーザーとして実行: **自分**
3. アクセスできるユーザー: **自分のみ**（推奨）

## ファイル構成

```
gas-project/
  Code.gs               - メインエントリポイント、WebApp doGet
  BedrockApi.gs          - AWS Bedrock API呼び出し（Claude Sonnet 4.6）
  EvaluationPrompt.gs    - 評価プロンプト、知識ベース
  SelfEvaluation.gs      - 自己評価処理、ギャップ分析
  SheetOperations.gs     - Google Sheets読み書き
  MailService.gs         - Gmail送信
  Index.html             - メイン画面
  Stylesheet.html        - CSS
  JavaScript.html        - クライアントサイドJS
  appsscript.json        - GASマニフェスト
```

## コスト

| 項目 | コスト |
|------|--------|
| GAS / Google Sheets / Gmail | 無料 |
| AWS Bedrock（Claude Sonnet 4.6） | 従量課金（約10〜15円/回） |
| **月額目安** | **約300〜450円**（月30回利用の場合） |

## ライセンス

MIT License
