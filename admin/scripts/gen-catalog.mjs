// Sinh src/api/catalog.generated.ts từ docs/catalog.json (nguồn gốc duy nhất của mã quyền).
// Chạy: npm run gen:catalog. Test "catalog.generated" kiểm tra tệp sinh ra khớp với catalog.json.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const catalog = JSON.parse(readFileSync(join(root, '..', 'docs', 'catalog.json'), 'utf8'))

const perms = catalog.permissions.map((p) => `  ${p.code.replace('.', '')}: '${p.code}',`).join('\n')
const out = `// TỆP SINH TỰ ĐỘNG từ docs/catalog.json bằng scripts/gen-catalog.mjs. Không sửa tay.
export const P = {
${perms}
} as const

export type PermissionCode = (typeof P)[keyof typeof P]
`
writeFileSync(join(root, 'src', 'api', 'catalog.generated.ts'), out)
console.log(`Đã sinh ${catalog.permissions.length} mã quyền.`)
