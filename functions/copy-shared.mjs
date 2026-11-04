// 배포 전에 알림 공용 코드를 functions/shared/ 로 복사 (Firebase는 functions 폴더만 올리기 때문)
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const out = join(here, 'shared');
const files = ['scripts/push/run.mjs', 'scripts/push/plan.mjs', 'src/lib/week.js'];

rmSync(out, { recursive: true, force: true });
for (const f of files) {
  mkdirSync(dirname(join(out, f)), { recursive: true });
  cpSync(join(root, f), join(out, f));
}
console.log(`공용 코드 ${files.length}개를 functions/shared/ 로 복사했어요.`);
