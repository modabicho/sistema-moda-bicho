/* ---------- Equipe · três blocos, três responsabilidades ----------
   A aba misturava cinco coisas numa tabela só: quem entra no sistema, quem
   trabalha, o que cada uma cuida, a conta de acesso e o roteamento da
   produção. Quem abria não conseguia responder a pergunta mais simples —
   "quem tem acesso ao PCP?" — sem entender o modelo do banco por baixo.

   Agora são três, e a fronteira é a pergunta que cada um responde:

     1 · ACESSOS DO PCP        quem entra, e o que cada um pode fazer
     2 · PESSOAS DA EQUIPE     quem trabalha, e do que cuida
     3 · ROTEAMENTO            para onde cada tipo de pedido vai

   O roteamento continua exatamente como está — nenhum responsável foi trocado,
   nada foi migrado de pessoa para conta. Isto é reorganização de tela. */
function viewEquipe() {
  const c = S.calc;
  const carga = {};
  (c?.tarefas || []).forEach((t) => { if (t.responsavel) carga[t.responsavel] = (carga[t.responsavel] || 0) + 1; });
  const semDono = (c?.tarefas || []).filter((t) => !t.responsavel).length;
  const acessos = acessosDoPcp();
  const pessoas = pessoasDaEquipe();
  /* a ordem dentro de `S.equipe` é o desempate das funções — a posição na lista
     completa é o que as setas movem, não a posição na lista filtrada */
  const posEm = (p) => S.equipe.findIndex((x) => x.id === p.id);

  const chipsDeFuncao = (p) => (p.funcoes || []).map((f) => {
    const rot = (FUNCOES.find((x) => x[0] === f) || ["", f])[1];
    const primeira = padraoLista(f)[0] === p.nome;
    return `<span class="tag" style="margin-right:4px" title="${primeira ? `A tarefa de ${esc(rot)} nasce com ${esc(p.nome)}` : `${esc(p.nome)} pode assumir ${esc(rot)}; a tarefa nasce com ${esc(padraoLista(f)[0] || "ninguém")}`}">${esc(rot)}${primeira ? ' <b style="font-family:var(--mono);font-size:9.5px;color:var(--acao)">1ª</b>' : ""}</span>`;
  }).join("") || '<span style="color:var(--ink-3)">nenhuma</span>';

  return `
  ${(() => { /* nomes que ficaram para trás depois de renomear ou excluir alguém */
    const usados = new Set();
    setores().forEach((st) => respDoSetor(st).forEach((n) => usados.add(n)));
    S.pedidos.forEach((r) => { if (PED_VIVO.includes(r.status) && r.responsavel) usados.add(r.responsavel); });
    const orfaos = [...usados].filter((n) => !S.equipe.some((p) => p.nome === n)).sort();
    return orfaos.length ? `<div class="aviso" style="border-color:var(--red);background:var(--red-soft);display:flex;align-items:center;gap:12px">
      <span><b>${esc(orfaos.join(", "))}</b> ${orfaos.length === 1 ? "não está" : "não estão"} mais na equipe, mas ainda ${orfaos.length === 1 ? "aparece" : "aparecem"} em setores ou pedidos em aberto.</span>
      <button class="btn sm primary" style="margin-left:auto" data-act="reatribuir">Substituir agora</button></div>` : ""; })()}
  ${semDono ? `<div class="aviso"><b>${semDono} ${semDono === 1 ? "tarefa está sem responsável" : "tarefas estão sem responsável"}.</b> Quem recebe cada etapa sai das <b>funções</b> marcadas na pessoa — abra <b>Editar</b> na linha dela e marque a etapa que ela cuida.</div>` : ""}

  <div class="card" style="margin-bottom:14px">
    <div class="card-h"><h2>Acessos do PCP</h2><span class="sub">quem entra no sistema, e o que cada um pode fazer</span></div>
    <div class="tw" style="max-height:none"><table class="t"><thead><tr>
      <th>Acesso</th><th>E-mail</th><th>Status</th><th>Pode</th><th>Ação</th></tr></thead>
    <tbody>${acessos.map((p) => `<tr>
      <td><span class="pessoa">${avatar(p.nome)}<b>${esc(p.nome)}</b></span></td>
      <td style="font-size:12px;color:var(--ink-2)">${esc(p.email || "—")}</td>
      <td>${p.ativo === false ? '<span class="tag">inativo</span>' : '<span class="tag ok">ativo</span>'}</td>
      <td style="font-size:11.5px">${p.adm ? '<span class="tag">Administradora</span> ' : ""}${esc(resumoDoAcesso(p))}</td>
      <td><button class="btn sm ghost" data-editar-acesso="${esc(p.id)}">Editar</button></td></tr>`).join("")
      || vazioLinha("nada", "Nenhum acesso configurado", "Quem entra no PCP entra por uma conta com e-mail e senha.")}
    </tbody></table></div>
    <details class="legenda"><summary>Como ler esta tabela</summary><div class="legenda-in">
      <span>Cada linha é uma forma de <b>entrar no PCP</b>, com e-mail e senha. Uma conta de setor é usada por quem estiver naquele posto.</span>
      <span><b>Pode</b> resume as abas que aquele acesso enxerga. O detalhe campo a campo está em <b>Editar</b>.</span>
    </div></details>
  </div>

  <div class="grid2">
    <div class="card">
      <div class="card-h"><h2>Pessoas da equipe</h2><span class="sub">quem trabalha aqui — a função marcada é quem recebe a tarefa</span>
      <button class="btn sm" style="margin-left:auto" data-act="reatribuir">Substituir pessoa</button>
      <button class="btn primary sm" data-act="nova-pessoa">${svg(IC.mais)}Nova pessoa</button></div>
      <div class="tw" style="max-height:none"><table class="t"><thead><tr><th>Pessoa</th><th>Funções</th><th class="num">Tarefas</th><th>Ação</th></tr></thead>
      <tbody>${pessoas.map((p) => { const i = posEm(p); return `<tr>
        <td><span class="pessoa">${avatar(p.nome)}<b>${esc(p.nome)}</b></span>${p.ativo === false ? ' <span class="tag">inativa</span>' : ""}</td>
        <td style="font-size:11.5px">${chipsDeFuncao(p)}</td>
        <td class="num">${carga[p.nome] || "—"}</td>
        <td style="white-space:nowrap"><button class="btn sm ghost" data-editar-pessoa="${esc(p.id)}">Editar</button>
          <button class="ic-btn" data-subir-pessoa="${esc(p.id)}" title="Subir na ordem — quem está mais acima recebe a tarefa primeiro" aria-label="Subir" ${i <= 0 ? "disabled" : ""}>${svg(IC.setaCima)}</button>
          <button class="ic-btn" data-descer-pessoa="${esc(p.id)}" title="Descer na ordem" aria-label="Descer" ${i === S.equipe.length - 1 ? "disabled" : ""}>${svg(IC.setaBaixo)}</button></td></tr>`; }).join("")
        || vazioLinha("nada", "Ainda não há ninguém na equipe", "Cadastre quem trabalha aqui dentro — é a função de cada uma que define quem recebe cada tarefa.", `<button class="btn primary sm" data-act="nova-pessoa">Nova pessoa</button>`)}
      </tbody></table></div>
      <details class="legenda"><summary>Como ler esta tabela</summary><div class="legenda-in">
        <span>Estas pessoas <b>não entram no PCP</b> — elas trabalham, recebem tarefa e aparecem como responsáveis. Quem entra está no quadro de cima.</span>
        <span><b>Funções</b> são as etapas que a pessoa cuida. Quando várias cuidam da mesma, <b>1ª</b> marca quem recebe a tarefa automaticamente — as outras aparecem como alternativa e dá para trocar em qualquer pedido.</span>
        <span>A ordem é a desta lista — use as setas na coluna <b>Ação</b> para mudar quem vem primeiro.</span>
      </div></details>
    </div>
    <div class="card">
      <div class="card-h"><h2>Roteamento de produção</h2><span class="sub">para onde cada tipo de pedido vai — não tem a ver com login</span>
        <button class="btn primary sm" style="margin-left:auto" data-act="novo-setor">${svg(IC.mais)}Novo setor</button></div>
      <div class="tw" style="max-height:none"><table class="t"><thead><tr><th>Setor</th><th>Responsável</th><th>Processos que caem nele</th><th>Ação</th></tr></thead>
      <tbody>${setores().map((st) => `<tr>
        <td><b>${esc(st.nome)}</b></td>
        <td>${(() => { const lista = respDoSetor(st);
          if (!lista.length) return '<span class="tag amber">sem responsável</span>';
          return lista.map((n2) => { const existe = S.equipe.some((p2) => p2.nome === n2);
            return `<span class="pessoa" style="${existe ? "" : "opacity:.6"}">${avatar(n2)}${esc(n2)}</span>${existe ? "" : ' <span class="tag red" title="Esta pessoa não está mais na equipe — edite o setor">fora da equipe</span>'}`; }).join(" "); })()}</td>
        <td style="font-size:11.5px;color:var(--ink-3)">${esc((st.processos || []).join(", ") || "nenhum — defina para direcionar")}</td>
        <td><button class="btn sm ghost" data-editar-setor="${esc(st.id)}">Editar</button></td></tr>`).join("")
        || vazioLinha("nada", "Ainda não há setores", "")}
      </tbody></table></div>
      <details class="legenda"><summary>Como ler esta tabela</summary><div class="legenda-in">
        <span>Ao criar um pedido, o processo do produto define o setor — e o responsável do setor já recebe a tarefa.</span>
        <span>O responsável aqui é <b>quem cuida da produção</b>, não quem entra no sistema. As duas coisas são independentes.</span>
      </div></details>
    </div>
  </div>`;
}
