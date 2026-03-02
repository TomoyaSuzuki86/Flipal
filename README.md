# Flipal

要件定義（`doc/要件定義.md`）に沿った、バックエンド不要の静的Webアプリです。

## 起動

`index.html` をブラウザで開くだけで動作します。

## 画像差し替え

1. 画像を `assets/images/` に配置（ファイル名は任意）
2. `assets/index.json` の `image` パスを更新

`index.json` 形式:

```json
{
  "entries": [
    {
      "date": "YYYY-MM-DD",
      "image": "./assets/images/sample.jpg",
      "message": "任意メッセージ"
    }
  ]
}
```

## 実装済み要件

- 今日/アーカイブ/詳細の3画面
- 未来日ロック（一覧表示はするが閲覧不可）
- 過去日は常時閲覧可
- 今日から翌日へのめくり演出（ボタン + スワイプ）
- 0:00跨ぎの自動更新
- `lastOpenedDate` 保存

## 注意

- 厳密な時刻保証は行わず、端末日付を基準に制御しています。
- 画像未配置時はプレースホルダー表示になります。
