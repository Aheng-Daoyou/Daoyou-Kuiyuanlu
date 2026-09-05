-- ============================================================
-- 0039_realm_check_include_zhangdeng
-- 修复：wanjiedaoyou_cultivators.realm 的 CHECK 约束缺失「掌灯」境界，
-- 导致角色无法从「执灯·圆满」突破进「掌灯·初期」（引擎/HTTP 突破落库时
-- 命中约束 → 500 / check constraint 23514）。
--
-- 根因：该约束为早期手加到库上（非由 schema.ts 生成、未进任何版本化迁移），
-- 其境界白名单漏写了 掌灯（执灯 与 近神 之间存在 掌灯）。
-- 本迁移幂等：存在则 drop 重建（补入掌灯，顺序贴合境界链），不存在则直接补建。
--
-- 回滚：drop 本约束即还原（本迁移重建的约束名与原一致）。
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cultivators_mvp_realm_check'
      AND conrelid = 'wanjiedaoyou_cultivators'::regclass
  ) THEN
    ALTER TABLE "wanjiedaoyou_cultivators"
      DROP CONSTRAINT "cultivators_mvp_realm_check";
  END IF;
END $$;

ALTER TABLE "wanjiedaoyou_cultivators"
  ADD CONSTRAINT "cultivators_mvp_realm_check"
  CHECK (((realm)::text = ANY (
    ARRAY['闻腥'::varchar, '守灯'::varchar, '窥渊'::varchar, '蚀体'::varchar,
          '忘川'::varchar, '执灯'::varchar, '掌灯'::varchar,
          '近神'::varchar, '渡渊'::varchar]::text[])
  ));
