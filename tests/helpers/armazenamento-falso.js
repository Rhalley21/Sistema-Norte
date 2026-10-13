// =========================================================================
// Armazenamento de arquivos (Supabase Storage) SIMULADO em memória, só com o que as funções usam:
// createSignedUploadUrl, list, createSignedUrl e remove. Guarda o que foi pedido (rastro) pra os testes
// conferirem o COMPORTAMENTO (caminho certo, tempo do link, o que foi apagado).
//
// Uso: const arm = criarArmazenamento();  arm.simularEnvio('bucket', 'emp/id/video.mp4', bytes, 'video/mp4');
//      admin.storage = arm;   arm.rastro  -> operações feitas;   arm.arquivos -> o que existe
// =========================================================================
function criarArmazenamento() {
  const arquivos = new Map(); // "bucket/caminho" -> { bytes, mimetype, size }
  const rastro = [];
  let contador = 0;
  const chave = (b, p) => `${b}/${p}`;
  return {
    arquivos,
    rastro,
    // O que o candidato faria com o link de envio: coloca o arquivo no lugar (o tamanho pode ser "declarado" à parte).
    simularEnvio(bucket, caminho, bytes, mimetype = 'video/mp4', tamanho) {
      arquivos.set(chave(bucket, caminho), { bytes, mimetype, size: tamanho ?? bytes.length });
    },
    from(bucket) {
      return {
        async createSignedUploadUrl(caminho, opcoes) {
          rastro.push({ op: 'createSignedUploadUrl', bucket, caminho, opcoes });
          return {
            data: { signedUrl: `https://fake/upload/${bucket}/${caminho}`, token: `tok-${++contador}`, path: caminho },
            error: null,
          };
        },
        async list(prefixo) {
          rastro.push({ op: 'list', bucket, prefixo });
          const base = `${bucket}/${prefixo}/`;
          const itens = [];
          for (const [k, v] of arquivos) {
            if (!k.startsWith(base)) continue;
            const resto = k.slice(base.length);
            if (resto.includes('/')) continue;
            itens.push({ name: resto, metadata: { size: v.size, mimetype: v.mimetype } });
          }
          return { data: itens, error: null };
        },
        async createSignedUrl(caminho, segundos) {
          rastro.push({ op: 'createSignedUrl', bucket, caminho, segundos });
          if (!arquivos.has(chave(bucket, caminho))) return { data: null, error: { message: 'Object not found' } };
          return { data: { signedUrl: `https://fake/download/${bucket}/${caminho}?exp=${segundos}` }, error: null };
        },
        async remove(caminhos) {
          rastro.push({ op: 'remove', bucket, caminhos: [...caminhos] });
          for (const c of caminhos) arquivos.delete(chave(bucket, c));
          return { data: caminhos.map((name) => ({ name })), error: null };
        },
      };
    },
  };
}

module.exports = { criarArmazenamento };
