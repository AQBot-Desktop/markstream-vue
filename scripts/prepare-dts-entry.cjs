const fs = require('node:fs')
const path = require('node:path')
const process = require('node:process')

const distDir = path.resolve(__dirname, '..', 'dist')
const sourcePath = path.join(distDir, 'types', 'src', 'exports.d.ts')
const targetPath = path.join(distDir, 'types', 'exports.d.ts')

function rewriteEntryImports(content) {
  return content
    .replace(/from\s+(['"])\.\//g, 'from $1./src/')
    .replace(/import\((['"])\.\//g, 'import($1./src/')
}

if (!fs.existsSync(sourcePath)) {
  process.exit(0)
}

fs.mkdirSync(path.dirname(targetPath), { recursive: true })
const sourceContent = fs.readFileSync(sourcePath, 'utf8')
const rewrittenContent = rewriteEntryImports(sourceContent)
fs.writeFileSync(targetPath, rewrittenContent)
console.log('Prepared declaration entry', targetPath, 'from', sourcePath)
