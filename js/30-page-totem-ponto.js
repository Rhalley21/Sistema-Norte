/* =========================================================
   TOTEM DO PONTO — tela que o RH deixa ligada na entrada da
   empresa exibindo o QR Code que gira sozinho. O colaborador
   escaneia esse código pra bater o ponto (ver js/29-page-ponto.js).
   O token vem da Edge Function "ponto" (action qr_atual), que o
   assina com o segredo da empresa — o navegador nunca vê o segredo.
   ========================================================= */

let _totemTimer = null;
let _totemPeriodoS = 20;

async function atualizarQrTotem() {
  const { data, error } = await sb.functions.invoke('ponto', { body: { action: 'qr_atual' } });
  const alvo = document.getElementById('totem-qr');
  if (!alvo) {
    pararTotem();
    return;
  }
  if (error || data?.error || !data?.token) {
    alvo.innerHTML = '<div class="empty">Não foi possível gerar o código. Recarregue a página.</div>';
    return;
  }
  _totemPeriodoS = data.periodoS || 20;
  if (typeof QRCode === 'undefined') {
    alvo.innerHTML = '<div class="empty">Biblioteca de QR não carregou. Recarregue a página.</div>';
    return;
  }
  // QRCode.toCanvas desenha o token atual num canvas limpo.
  alvo.innerHTML = '';
  const canvas = document.createElement('canvas');
  alvo.appendChild(canvas);
  QRCode.toCanvas(canvas, data.token, { width: 300, margin: 1 }, (err) => {
    if (err) console.error('Falha ao desenhar QR', err);
  });
}

function iniciarTotem() {
  if (_totemTimer) return;
  atualizarQrTotem();
  // Renova um pouco mais rápido que a janela, pra o código na tela estar
  // sempre "fresco" quando alguém escaneia.
  _totemTimer = setInterval(() => {
    if (!document.getElementById('totem-qr')) {
      pararTotem();
      return;
    }
    atualizarQrTotem();
  }, 8000);
}
function pararTotem() {
  if (_totemTimer) {
    clearInterval(_totemTimer);
    _totemTimer = null;
  }
}

function pageTotemPonto() {
  setTimeout(iniciarTotem, 60);
  return `
    <div class="page-head">
      <div class="eyebrow">Pessoas · Ponto</div>
      <h1>Totem de ponto</h1>
      <p class="page-desc">Deixe esta tela aberta na entrada da empresa. O QR Code se renova sozinho — os colaboradores escaneiam para bater o ponto.</p>
    </div>

    <div class="card totem-card">
      <div id="totem-qr" class="totem-qr"><div class="empty">Gerando código…</div></div>
      <div class="totem-legenda">
        <div class="totem-pulse"></div>
        Código ativo — renova automaticamente
      </div>
      <p class="small-muted" style="margin-top:14px;text-align:center;max-width:420px;">
        Dica: use um tablet ou monitor dedicado. Se a tela ficar muito tempo apagada, recarregue a página para retomar a renovação.
      </p>
    </div>
  `;
}
