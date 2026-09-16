/* ---------- "está salvo?" ----------
   A pergunta que a operação faz o tempo todo. Antes a resposta era só um horário,
   que envelhece mal: "salvo 17:42" às 18h30 não diz se está tudo bem agora.
   Agora o estado é um dos quatro abaixo, o tempo é relativo e se atualiza sozinho,
   e clicar abre o que fazer quando algo deu errado. */
const horaCurta = (d) => d ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—";
function haQuanto(d) {
  if (!d) return "";
  const seg = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  if (seg < 8) return "agora";
  if (seg < 60) return `há ${seg} s`;
  const min = Math.round(seg / 60);
  if (min < 60) return `há ${min} min`;
  return `às ${horaCurta(d)}`;
}
function estadoGravacao() {
  const n = _pendentes.size;
  if (CAMADA === "memoria") return { tom: "erro", txt: "Não sincronizado", n };
  /* "Salvando…" é estado de passagem: nada está errado e nada está pronto.
     Era o único lugar do app onde `andando` significava neutro em vez de
     "isto está ativo" — a classe continua `andando` porque o CSS dela é o
     ponto pulsando, mas o significado agora está dito por escrito. */
  if (_gravando) return { tom: "andando", txt: "Salvando…", n: 0 };
  if (SALVO.ok === false) return { tom: "erro", txt: "Não sincronizado", n };
  /* fila parada com coisa dentro não é "salvando": é trabalho seu esperando */
  if (n) return { tom: "espera", txt: `${n} ${n === 1 ? "alteração pendente" : "alterações pendentes"}`, n: 0 };
  if (SALVO.ok) return { tom: "ok", txt: `Salvo ${haQuanto(SALVO.quando)}`, n: 0 };
  return { tom: "ok", txt: "Tudo salvo", n: 0 };
}
