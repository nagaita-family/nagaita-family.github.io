# 家族のあんしん — Firebase版 (v2)

端末：直也・彰子のGoogleアカウントでログイン（子どもにアカウント不要）。
安否と位置をそれぞれ最小操作で報告。静的PWAは `https://family.nagaita.jp/safety/` に配置。
現時点でFirebaseのプロジェクト接続は**未設定**。フロントエンドだけで送信完了を謳わないこと。

## 設定手順

1. [Firebase Console](https://console.firebase.google.com/)でプロジェクトを作成。FireStore (Native mode) を有効化する（リージョンは確定後変更が難しいため、冗長性と日本からの接続性を確認して選ぶ）。
2. Authentication > Sign-in method > Google を有効化する。Authentication > Settings > Authorized domains に `family.nagaita.jp` を登録する。
3. Project settings > Your apps でWebアプリを追加し、`firebaseConfig` の `apiKey`, `authDomain`, `projectId`, `appId` を取得。`safety/firebase-config.js` に入力する。**ここに秘密鍵を入れない**。Firebase Web API key自体はアクセス権限を付与しない。
4. 初回は家族2人がGoogleログインし、未登録として表示される **UID** をそれぞれ控える。Firestoreはこの時点ではルールで全員拒否されるため、安否登録はできない。
5. `safety/firebase-config.js` の `parents.naoya`, `parents.shoko` にUIDを設定。**必ず別の2アカウント**。UIDは認証の識別子であり秘密鍵ではない。
6. `safety/firestore.rules` 内の `REPLACE_WITH_NAOYA_AUTH_UID` と `REPLACE_WITH_SHOKO_AUTH_UID` を同じUIDに置換し、ルールをFirestoreへ適用する。コンソール Rules タブで貼り付け、またはリポジトリをローカルに取得して `safety/` から `firebase deploy --only firestore:rules --project PROJECT_ID`。デプロイ完了を検証する。
7. 直也・彰子それぞれの端末で、ログイン→「無事」→位置更新→相手端末で最新報告を確認する。Firestoreの Rules Playground または Emulator Suite で未登録UIDの **read / write が拒否される** ことも確認する。
8. 機内モードで報告→端末内に未送信と表示→ネット復帰で同期→相手端末反映を検証する。再送・位置追記・別端末の新しい報告を古い報告が上書きしないことも確認。

## 動作・障害時挙動

- 1報告につき本人と選択された子どもの各1ドキュメントを追加。各ドキュメント：person/reporter/status/observedAt/任意GPSのみ。
- 認証された親は家族全員の最新報告のみ購読。担当する親は本人と子どもだけ更新でき、相手の大人の状態を改ざんできない。
- 安否はGPSを待たず端末ローカルキューに記録。GPS取得後、同じイベントに位置情報を追加。キューはネット復帰後に再送し、Firestore書き込みの完了が取れるまで「送信済」と表示しない。
- 各人の最新報告は日時順に表示。1時間以上前なら「前回」と明示。位置は取得時刻を別表示。
- 通常のブラウザーだけでSMS自動送信はできないためSMS作成画面への遷移まで。171/web171は独立の代替ルート。
- Firebase SDKは初回オンライン時の取得が必要。以降PWAシェルがキャッシュされれば、Firebaseに接続できない場合でも端末内で報告保存とSMS準備は行える。
- v1のNetlify秘密情報はFirebaseに自動移管しない。旧v1ローカル未送信キューも自動送信しない（内容・時刻を確認の上で再報告する）。

## 運用上の注意

- Firestoreルールは認証だけでなく固定UIDによる家族限定。**単に `request.auth != null` で許可しない。**
- Web Firebase設定はGitHub Pagesで公開される。サービスアカウントJSONや管理者秘密鍵、実際のGPSデータは絶対にGitHubに置かない。
- Googleログイン済みスマホを第三者に渡さない。紛失時はアカウントセッションを無効化する。
- 初版は追記型の安否ログを保持。継続運用前に履歴保管期間（例：30日）と自動削除方針を決めること。Firebaseの保存地域・費用・利用規約も確認。
- 通信網障害時の到達は保証できない。必ずSMS、171/web171、集合場所など別経路を用意する。
- デプロイや実端末での相互通信試験が終了するまでは**防災の本番連絡手段として扱わない**。
