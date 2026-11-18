import { join } from 'node:path';
import { root, run } from './runtime.mjs';
run(process.execPath, ['--test'], join(root, 'frontend'));
run(process.execPath, ['--test', 'scripts/supabase.test.mjs'], root);
