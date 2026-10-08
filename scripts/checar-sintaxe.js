// Confere a sintaxe de todos os arquivos js/*.js (funciona igual no Windows, Mac e Linux).
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const pasta = path.join(__dirname, '..', 'js');
const arquivos = fs.readdirSync(pasta).filter((f) => f.endsWith('.js'));
let erros = 0;
for (const arquivo of arquivos) {
  const r = spawnSync(process.execPath, ['--check', path.join(pasta, arquivo)], { encoding: 'utf8' });
  if (r.status !== 0) {
    erros++;
    console.error(`✗ js/${arquivo}\n${r.stderr}`);
  }
}
console.log(erros ? `${erros} arquivo(s) com erro de sintaxe.` : `Sintaxe OK em ${arquivos.length} arquivos.`);
process.exit(erros ? 1 : 0);
