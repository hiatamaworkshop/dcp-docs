# $G Grouping Marker — Draft

> Status: design decision, pre-deploy discussion. Not yet in spec.

## 背景

複数ノードをストリームで渡す場合、どこからどこまでが同一グループかを明示する必要がある。
データ統合はしない — 並べるだけ。開始と終わりをマーカーで表現する。

## 仕様

| 記号 | 形式 | 意味 |
|------|------|------|
| 開始 | `["$G", label]` | グループ開始、label 必須 |
| 終了 | `["$G/"]` | グループ終了 |

## 例

```
["$G", "search_results"]
["$S","knowledge:v1","layer","source","signal","detail"]
["quality","push","no-type-tag","auth jwt fix"]
["$S","knowledge:v1"]
["session","recall","hit","dcp-gateway design"]
["$G/"]
```

## ルール

- `label` は必須（エージェントが文脈を掴むため）
- ネスト禁止（`$G` 内に `$G` は不可）
- 中身は任意の DCP ブロック（異スキーマ混在OK）
- データ統合はしない。複数スキーマは並列に並べるだけ

## DB との対比

| DCP | DB equivalent |
|-----|--------------|
| `$G` / `$G/` | `GROUP BY` の結果セット境界 |

## 検討経緯

- パケット方式（ノード数宣言）も検討したが、ストリームではマーカー式が自然
- `$G/` 終了マーカーはパース途中でも整合性確認が可能
- データが混ざる統合はNG、提示の仕方で対処する設計思想