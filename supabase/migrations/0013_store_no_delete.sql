-- supabase/migrations/0013_store_no_delete.sql
-- WBS 5.2 점검 (#93, 11/24). 매장 삭제 기능은 화면·서버 액션 어디에도 없는데, stores_owner(for all) 정책 때문에
-- 로그인한 사용자가 브라우저의 anon 키로 REST DELETE /rest/v1/stores를 부르면 자기 매장을 지울 수 있었다.
-- 매장을 지우고 다시 만들면 ai_usage가 cascade로 함께 지워져 AI 하루 한도(increment_ai_usage)를 다시 얻는다.
-- 쓰는 기능이 없으므로 delete·truncate 권한만 회수한다. 매장 생성(insert)·조회는 그대로다.
-- 새 이메일로 가입해 새 매장을 만드는 경로는 남는다 (계정당 한도, 결과보고서의 알려진 한계).

revoke delete, truncate on stores from anon, authenticated;
