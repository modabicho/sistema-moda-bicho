/* a saudação acompanha o e-mail digitado, sem redesenhar a tela de entrada */
document.addEventListener("input", (e) => {
  /* repinta SÓ a frase da conta. Um render inteiro aqui tiraria o cursor do
     campo no meio da digitação — é a regra do redesenho de fundo. */
  if (e.target?.matches?.("[data-destino]")) { repintarDestino(); return; }
  /* ---------------------------------------------------------------------------
     v8.83 · O NÚMERO DO PEDIDO RESPONDE A CADA TECLA, SEM PISCAR
     ---------------------------------------------------------------------------
     Antes o aviso "esse número já existe" só aparecia ao SAIR do campo — e
     aparecia repintando a janela inteira. Agora ele acompanha a digitação e
     escreve só duas coisas no lugar onde elas estão: a dica embaixo do campo e
     o botão "Usar o sugerido". A janela (o nó `.ov`) não é tocada, então foco,
     cursor e o que está digitado ficam onde estão — é o mesmo campo.
     A consulta é local (`numeroEmUso` lê a memória): nada de servidor, nada de
     gravação, nada de debounce — e nada de resposta velha chegando atrasada.
     O rascunho (`S.modal.v`) continua sendo guardado no `change`, como antes.
     --------------------------------------------------------------------------- */
  if (e.target?.id === "np-num" && S.modal?.tipo === "novoPedido") {
    if (typeof npNumRefrescar === "function") npNumRefrescar();
    return;
  }
  const t = e.target;
  if (!t || t.id !== "sp-email") return;
  const h2 = document.getElementById("sp-ola"), sub = document.getElementById("sp-sub");
  if (h2) h2.innerHTML = ola(t.value);
  if (sub) sub.textContent = nomeDoEmail(t.value) ? "Entre para continuar de onde parou." : "Entre com a conta da empresa para continuar.";
});

