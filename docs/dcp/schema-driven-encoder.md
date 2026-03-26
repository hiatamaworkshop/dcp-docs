# スキーマ駆動エンコーダ

DCP の中心原理。エンコーダはハードコードしない — スキーマ定義がフィールド順序の唯一の真実 (single source of truth) であり、エンコーダはスキーマをロードして位置を解決するだけ。

## スキーマがエンコーダを決定する

```
スキーマ JSON → フィールド順序を読む → 任意のデータ → positional array

schema("hotmemo:v1")       → fields: [layer, source, signal, detail]
schema("knowledge:v1")     → fields: [action, domain, detail, confidence]
schema("rag-chunk-meta:v1") → fields: [source, page, section, score, chunk_index]
```

エンコーダのコードにドメイン知識は不要。スキーマ JSON を 1 ファイル追加すれば、同じエンコーダが新しいデータ構造を扱える。

## 3 つのエンコード経路

DCP データを生成する経路は 3 つあり、それぞれ役割が異なる:

```
1. システム側エンコーダ（スキーマ駆動）
   内部データ → schema.fields で位置解決 → positional array
   用途: hotmemo、receptor 出力、RAG メタデータなど
   特徴: 正確。スキーマに従う限りエラーは発生しない。

2. LLM 出力（validator で教育）
   LLM が native フィールドに直接 positional array を書く
   用途: engram_push の native フィールド
   特徴: 不安定。validator + passive education で精度を上げていく。

3. パイプライン入口エンコーダ
   NL メタデータ → encoder → positional array → LLM に渡す
   用途: RAG パイプライン、ログ→LLM、API 応答→LLM
   特徴: 1 回だけ。ルールベース変換（LLM 不要）。
```

経路 1 と 3 は本質的に同じ — **スキーマからフィールドマッピングを読み、位置に変換する**。違いはデータの出所だけ（内部状態 vs 外部入力）。

## なぜスキーマ駆動が正解か

```
ハードコード方式:
  rows.push(["quality", "push", flag, detail])       // hotmemo 固有のコード
  rows.push(["receptor", "passive", signal, detail])  // receptor 固有のコード
  → スキーマのフィールド順を変えたら → 全コードを手で修正
  → 新スキーマを追加するたびに → 専用フォーマット関数を書く

スキーマ駆動方式:
  encoder = DcpEncoder(schema.load("hotmemo:v1"), mapping)
  encoder.encode(data)  // → スキーマが変われば出力も変わる
  → スキーマ変更 → JSON ファイル 1 つ修正、コード変更なし
  → 新スキーマ → JSON ファイル 1 つ追加、コード変更なし
```

スキーマがコードの外にある限り、エンコーダは汎用のまま保てる。**新しいデータ型の追加がプログラミングタスクではなく設定タスクになる。**

## encoder ではなく validator（LLM 出力の話）

スキーマ駆動エンコーダは**システムが内部データを DCP に変換する**話。LLM の出力については逆のアプローチを取る。

```
✗ LLM の出力を受けてシステムが encoder で DCP に変換する
  → LLM は自然言語を出し続ける。成長しない。
  → マルチエージェント時代に通用しない（engram 以外の通信先に encoder はない）

✓ LLM 自身が DCP で出力し、システムは validator で準拠チェックする
  → phi-agent パターン: 出力モードを制限することで精度向上
  → LLM が DCP を話せるようになる。engram が教育の場。
```

LLM 出力を変換する常駐 encoder は DCP の思想に反する。**翻訳コスト削減のために翻訳コストを払う** 矛盾。

## 実装状況

| 実装 | 言語 | 状態 |
|---|---|---|
| dcp-rag | Python | `DcpSchema` + `FieldMapping` + `DcpEncoder` — 汎用エンコーダ実装済み |
| engram | TypeScript | スキーマ定義あり (`gateway/schemas/`)、エンコーダはハードコード。TS 汎用エンコーダは未実装 |