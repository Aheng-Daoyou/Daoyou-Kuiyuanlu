/**
 * 修复先天命数脏数据脚本。
 *
 * 背景：DB 中存在 effects 为空的命数行（历史上某次实验性写入遗留），
 * 表现为角色页「先天命数」显示「命数 probe」等乱码描述、详情无效果条目。
 * 现行生成链路（FateEngine.generateCandidatePool + applyFateNaming）不可能
 * 产出空 effects，故直接按原品阶重新生成候选命格（含 AI 命名，失败降级
 * 本地预设）并回写。
 *
 * 用法：bun scripts/repair-broken-fates.ts [--dry]
 */
import postgres from 'postgres';
import { FateEngine } from '@server/lib/services/FateEngine';
import { applyFateNaming } from '@server/lib/services/FateNamingService';
import type { PreHeavenFate } from '@shared/types/cultivator';
import type { Quality } from '@shared/types/constants';

const DRY = process.argv.includes('--dry');
const sql = postgres(
  process.env.DATABASE_URL ?? 'postgresql://daoyou:daoyou@127.0.0.1:5432/daoyou',
  { max: 1 },
);

async function main() {
  const broken = await sql`
    SELECT id, name, quality
    FROM wanjiedaoyou_pre_heaven_fates
    WHERE COALESCE(jsonb_array_length(details->'effects'), 0) = 0
    ORDER BY quality, id`;
  console.log(`发现 ${broken.length} 条空 effects 命数行`);
  if (broken.length === 0) return;

  // 统计所需品阶
  const needByQuality = new Map<string, number>();
  for (const row of broken) {
    const key = row.quality ?? '凡品';
    needByQuality.set(key, (needByQuality.get(key) ?? 0) + 1);
  }
  console.log(
    '所需品阶:',
    Array.from(needByQuality.entries())
      .map(([q, n]) => `${q}×${n}`)
      .join('，'),
  );

  // 先本地滚池配齐各品阶（无 AI 消耗），最后对选中集合做一次批量 AI 命名
  const filledByQuality = new Map<Quality, PreHeavenFate[]>();
  const wantedQualities = Array.from(needByQuality.keys()) as Quality[];
  for (let round = 0; round < 30; round += 1) {
    const pool = await FateEngine.generateCandidatePool({ candidateCount: 48 });
    for (const q of wantedQualities) {
      const have = filledByQuality.get(q)?.length ?? 0;
      const need = needByQuality.get(q) ?? 0;
      const take = pool.filter((f) => f.quality === q).slice(0, need - have);
      if (take.length > 0) {
        filledByQuality.set(q, [...(filledByQuality.get(q) ?? []), ...take]);
      }
    }
    const allFilled = wantedQualities.every(
      (q) => (filledByQuality.get(q)?.length ?? 0) >= (needByQuality.get(q) ?? 0),
    );
    if (allFilled) break;
  }

  const rowSourcePairs: Array<{
    row: { id: string; name: string; quality: string | null };
    source: PreHeavenFate;
  }> = [];
  for (const row of broken) {
    const q = (row.quality ?? '凡品') as Quality;
    const candidate = (filledByQuality.get(q) ?? []).shift();
    if (!candidate) continue;
    rowSourcePairs.push({
      row: { id: row.id, name: row.name, quality: row.quality },
      source: candidate,
    });
  }
  console.log(`候选配齐 ${rowSourcePairs.length}/${broken.length}，开始批量 AI 命名…`);
  // 48 条一次性结构化输出对 glm-4.5-air 过重（反复 schema 重试可能数分钟不归），
  // 分块命名：单块失败只影响该块，降级为引擎本地预设名。
  const NAMING_CHUNK = 10;
  const namedBySource = new Map<PreHeavenFate, PreHeavenFate>();
  for (let i = 0; i < rowSourcePairs.length; i += NAMING_CHUNK) {
    const chunk = rowSourcePairs.slice(i, i + NAMING_CHUNK).map((p) => p.source);
    process.stdout.write(`命名进度 ${i + 1}-${Math.min(i + NAMING_CHUNK, rowSourcePairs.length)}/${rowSourcePairs.length}…\n`);
    const named = await applyFateNaming(chunk);
    named.forEach((fate, j) => namedBySource.set(chunk[j]!, fate));
  }

  // 逐行回写
  let repaired = 0;
  let skipped = 0;
  for (const { row, source } of rowSourcePairs) {
    const q = (row.quality ?? '凡品') as Quality;
    const candidate = namedBySource.get(source);
    if (!candidate) {
      skipped += 1;
      console.warn(`[skip] ${row.name}（${q}）：候选池未覆盖该品阶`);
      continue;
    }
    if (DRY) {
      console.log(
        `[dry] ${row.name}（${q}）-> ${candidate.name}：${candidate.description}`,
      );
      repaired += 1;
      continue;
    }
    await sql`
      UPDATE wanjiedaoyou_pre_heaven_fates
      SET name = ${candidate.name},
          quality = ${candidate.quality ?? q},
          description = ${candidate.description ?? null},
          details = ${sql.json({
            effects: (candidate.effects ?? []) as unknown as never,
            generationModel: (candidate.generationModel ?? null) as unknown as never,
            namingMetadata: (candidate.namingMetadata ?? null) as unknown as never,
          })}
      WHERE id = ${row.id}`;
    repaired += 1;
    console.log(`[ok] ${row.name}（${q}）-> ${candidate.name}：${candidate.description ?? ''}`);
  }

  console.log(`完成：修复 ${repaired} 条，跳过 ${skipped} 条${DRY ? '（dry-run 未写库）' : ''}`);
}

main()
  .catch((error) => {
    console.error('修复失败:', error);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
