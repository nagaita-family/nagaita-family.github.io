# 家族のあんしん — Firebase 匿名端末登録版 (v2.1)

**目的**：「無事／要支援」「現在地」を最小通信量・最小操作で共有。災害時のログイン操作を禁止する。
操作担当：直也と彰子の各1台。美織・こうすけは同席を確認した親が代理報告。
公開予定URL: https://family.nagaita.jp/safety/ （コードのGitHub反映と本番Web公開は別途検証する）

## 重要：未稼働

現時点で `safety/firebase-config.js` に実プロジェクトが設定されていないため、**Firestoreへの送信・同期は稼働していない**。端末内記録とSMSの操作のみ。
FirebaseプロジェクトとFirestoreルールの本番設定・通信テストが済むまで緊急連絡の主手段にしない。

## 災害時の体験

1. 平時に端末を登録（最初の一度だけ、オンラインでFirebase匿名認証IDを発行）。
2. 災害時はホーム画面アイコンをタップして本人の「無事」「助けて」を押すだけ。ログイン画面やパスワード入力は出ない。
3. GPS取得を待たず報告を端末内に記録し、認証済み＆オンラインならFirestoreに送信。GPSは後から追記。
4. 認証更新・回線・Firestore停止ではローカル保存と明示。SMSおよび171/web171を利用。
5. Firebase匿名認証は同じブラウザーのローカル保存領域に継続する。**Webサイトデータ削除、端末買い替え、匿名ID失効では再登録が必要**。オフラインで新たな匿名IDを登録することはできない。

## 初回のみ必要な設定

1. Firebase ConsoleでSpark（無料）プロジェクトを作成。Firestore Standard、**default database**を使う。データ保管地域は設定時に確認。
2. Authentication > Sign-in methodで **Anonymous（匿名）** をON。Googleログインは不要。Identity Platformの匿名ユーザー自動削除（30日で削除）は使用しない。
3. Web AppのAPI key、authDomain、projectId、appIdを `firebase-config.js` に設定（これらはFirebase Webクライアント用の公開設定であり、サービスアカウント秘密鍵は絶対に置かない）。
4. 直也・彰子の各端末でアプリを**オンラインで1回**開く。匿名ユーザーが自動作成され、本人のUID（端末登録ID）が初期設定画面に表示される。
5. その2つのUIDを `firebase-config.js` の `parents.naoya`, `parents.shoko` に入力。異なる2つのUIDであることを確認。
6. `firestore.rules` の `REPLACE_WITH_NAOYA_AUTH_UID` と `REPLACE_WITH_SHOKO_AUTH_UID` をそれぞれのUIDに置き換えてFirebase Firestore > Rulesで**Publish**する（またはFirebase CLIからdeploy）。**未承認の匿名UIDにはread/writeを許可しない**。
7. 2台それぞれで再起動。ログイン画面なしに本人の安否報告ができることを確認。Firebase Rules Emulator等で第三者UIDからの読み取り・書き込み拒否を確認。
8. 実地検証：一方で報告→他方に受信、GPSを後から追記、機内モードで報告→端末再起動→通信復帰後再送。**送信ができたことと相手が見たことは別**。

## 安全性・運用

- 匿名認証でも *誰でも読める* ようにしない。Firestoreセキュリティルールに、2台の固定UIDと匿名プロバイダの両方を照合する制限を実装。
- UIの利用者選択は信用せず、実際のFirebase UIDでサーバールールが権限を制限。
- 紛失・交換時は必ずFirebaseルールから該当UIDを外し、新UIDで登録し直す。
- 匿名認証の永続性はブラウザー内データに依存する。iOS/AndroidのPWAにおけるサイトデータ削除・権限失効・トークン更新失敗も想定する。災害時の認証基盤停止をゼロにはできない。
- 災害前に定期的な接続確認（例えば月1回）とSMS/171への切替訓練をしておく。
- Firestoreは報告ごとに追記する。最も新しい報告のみ表示し、1時間超の安否は「前回」と表示する。将来的に履歴削除・保管期間ルールの設計が必要。
- 旧Netlify APIはGitHubから削除済み。未反映の古いNetlifyデプロイは別途停止／反映確認すること。v1未送信キューは匿名認証に自動移行されない。
- 小さな利用ならFirebase Sparkの無料枠で運用できる見込み。Firestore Standardの無料枠は保存1GiB、読み取り5万/日、書き込み2万/日。無料枠上限やサービス障害で届かない可能性があるため、代替経路が必須。

## オフラインの注意

ローカル端末の送信キューは `localStorage`。FireStoreの永続キャッシュとは別で、書き込み成功が確定するまで削除しない。Webブラウザーのストレージ削除はどちらも消してしまう可能性がある。
