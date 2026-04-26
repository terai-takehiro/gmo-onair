-- v2.5.0: dev 環境で password 認証を使えるようにする
-- 既存の dev seed ユーザー (account@gmo-globalstudio.com / *@globalstudio.example.com)
-- に対して password_hash と status='active' を backfill する。
--
-- パスワード: "dev1234" (bcrypt 12 rounds)
-- 既に password_hash が入っているユーザーは触らない (本番アカウントを保護)。

UPDATE users
SET
  password_hash = '$2b$12$9yC0y81WAx2GzzJYXr7o9eD6kq1W.wjkEcB7r0AcTUxUuZe8rgVAq',
  status = 'active'
WHERE
  password_hash IS NULL
  AND deleted_at IS NULL
  AND (
    email = 'account@gmo-globalstudio.com'
    OR email LIKE '%@globalstudio.example.com'
  );
