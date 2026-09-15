« v8.92 · o módulo de Notificações saiu inteiro »

`entrega-v892/PCP-v8.92.html` · md5 **`c7866c5ccf059758923bb99a1ce3d2f7`** · 31.633 linhas
(a v8.91 tinha 33.005 — **1.372 linhas a menos**)
Bateria nova `testes/v892-sem-notificacoes.js` — **42 ok · 0 falhas**

**Uma nota sobre o número da versão.** Você pediu "remover na v8.91", mas a v8.91
já é um binário entregue com md5 próprio. Mexer no conteúdo dela quebraria essa
referência, então isto saiu como **v8.92, em cima da v8.91**. Nada mais mudou.

---

# 1 · A pergunta-portão: `pcp_adm` é usada fora de Notificações?

**Não.** Quatro ocorrências no app inteiro, todas dentro do diagnóstico das
notificações:

| onde | o que era |
|---|---|
| `notificacoes.js:351-352` | o passo "Tabela `pcp_adm` existe e tem alguém" |
| `notificacoes.js:358` | o passo "Você está na `pcp_adm`" |
| `notificacoes.js:786` | o texto do erro 401/403 |
| `modal.js:2190-2191` | o texto de conserto dentro da janela `notifDiag` |

**Quem decide se você é administradora não é a `pcp_adm`** — é `ehAdm()`, em
`sessao/acesso.js:71`, que pergunta ao servidor (`eqAdmDoServidor()`) e, na
falta de resposta, olha `S.equipe`. Ela é usada em **20 lugares** (Produtos,
Painel, Fábrica, Cadastros, Sistema, Acesso) e **ficou intacta**.

Ou seja: com as Notificações fora, **nenhuma linha do PCP toca `pcp_adm`**. A
tabela continua no Supabase — **não mexi em nada lá**, como você pediu. Se a
regra de linha (RLS) da tabela `notificacoes` depende dela, isso é do lado do
servidor e continua de pé.

---

# 2 · A sua lista × o que a v8.91 tinha

Tudo o que você listou existia. Nada faltou.

| o que você mandou remover | onde estava na v8.91 | saiu? |
|---|---|---|
| aba/menu `notificacoes` | `relatorios.js` 311 · 428-431 · 466 · 501 · 504 · 646 | ✔ |
| `S.notifs` | `estado.js:157` | ✔ |
| sino e painel do cabeçalho | `relatorios.js` 698 e 706 → `sinoNotif()` / `painelNotif()` | ✔ |
| polling `ligarNotifs()`/`carregarNotifs()` e timers | **`componentes/toast.js` 184-236** (não no arquivo de notificações) + `boot.js:216` | ✔ |
| funções `notif*` | `notificacoes/notificacoes.js` — 790 linhas | ✔ |
| `viewNotificacoes`, caixa, painel de enviadas, formulário | `notificacoes.js` 447 · 554 · 570 · 691 | ✔ |
| modais `notifRecusa`, `notifHist`, `notifApagar`, `notifDiag` | `modal.js` 2098 · 2119 · 2157 · 2177 (106 linhas) | ✔ |
| handlers `data-nt-*`, `data-fechar-sino`, `data-act="sino"` | `clique.js` 910-969 · `acoes/pedidos.js` 3-40 | ✔ |
| atalhos de teclado | `atalhos.js` 20 · 40 · 66 · `teclado.js` 39-40 | ✔ |
| CSS `.sino`, `.sino-n`, `.nt-*` e animações exclusivas | `gramatica.css` 280 · 348-423 · 595-643 · 661-694 | ✔ |
| exceções de `restaurarAba()` e `podeAba()` | `presenca.js:284` · `acesso.js:79` | ✔ |
| `_supaReq()` tratamento especial | `persistencia.js:78` | ✔ |
| textos, badges, contadores e mapeamentos de view | `relatorios.js` 311 · 504 · 646 | ✔ |
| `mtItens()` / Tarefas, `mtMotivoNotif()`, `mtAcaoNotif()` | `meu-trabalho.js` 58-79 · 129-155 · 157 · 164-165 | ✔ |

## O que estava na v8.91 e **não** estava na sua lista

Cinco coisas. As duas primeiras são as que teriam quebrado o app.

### A · o motor das notificações morava dentro do `toast.js`

O arquivo que você mandou **preservar** era metade notificação. Das 236 linhas,
o toast acaba na **120**; da 121 até o fim era tudo recado:

```
NOTIF_TIPOS · NOTIF_TIPO_NOME · NOTIF_EXIGE_ACAO · NOTIF_SITS · NOTIF_MOTIVOS
NOTIF_MOTIVO_NOME · NOTIF_INTERVALO (180000) · _notifTimer · _notifPisca
meuEmail() · temServidorNotif() · _notifReq() · carregarNotifs() · ligarNotifs()
```

Corte cirúrgico: **mantive 1-120, removi 121-236.** O `toast`, o `toastPasso`,
o `_avisar`, o `regua`, o `pct`, o `prio`, o `kpi` e o `tagMaterial` estão todos
de pé — e a bateria prova isso desenhando um aviso de verdade na tela (bloco B2).

### B · o `notificacoes.js` também não era só notificação — e isso quase me pegou

As últimas **33 linhas** do arquivo eram **o preâmbulo dos Insumos**:

```js
const INS_TIPOS · INS_UNIDADES · INS_CATEGORIAS · normIns
const fornecedorPorId · insumos() · movsInsumo() · entradasNF()
const insumoPorId · insumoPorCodigo
```

`insumos()` é usada em **seis arquivos**. Apaguei o arquivo, a tela de Tarefas
estourou com `insumos is not defined`, e **foi a bancada que pegou** — não a
leitura. Restaurei essas 33 linhas como `insumos/preambulo.js`, registrado no
manifesto exatamente onde o `notificacoes.js` estava, para a ordem de
concatenação não mudar. Bloco B da bateria guarda isso agora.

### C · `meuEmail()` e `temServidorNotif()`

Duas funções sem prefixo `notif`, mas usadas **só** por notificações
(`acesso.js:79`, `relatorios.js:428`, `meu-trabalho.js:61`, `atalhos.js:66`).
Foram junto. `ehAdm()`, que é parecida e **não** é de notificações, ficou.

### D · o alerta no Painel

`telas/painel.js:243` chamava `alertaNotifInicio()` — a faixa vermelha de
urgente na tela inicial. Você não citou o Painel. Saiu.

### E · a barra do celular

`relatorios.js:466` fixava Notificações como o **terceiro** dos quatro alvos da
barra de baixo. O código já previa a ausência (`acha("notificacoes") ||
acha("tarefas") || acha("demanda")`); tirei o primeiro termo. A barra agora é
**Hoje · Pedidos · Tarefas · Mais**, sem buraco.

---

# 3 · A busca depois · e por que cada sobra ficou

Procurei os sete termos que você pediu. **Não sobrou nenhum código** — só cinco
comentários, e três deles eu reescrevi:

| termo | ocorrências | veredito |
|---|---|---|
| `notificacoes` | 0 em código | — |
| `S.notifs` | 0 | — |
| `notif` | 0 em código | — |
| `data-nt` | 0 | — |
| `sinoNotif` | 0 | — |
| `ligarNotifs` | 0 | — |
| `carregarNotifs` | 0 | — |

**As duas frases que deixei de propósito**, as duas em `acoes/clique.js`:

- **linha 434** — *"foi exatamente o bug dos botões de notificação"*. É a lição
  de por que `data-abrirrem` (Semiacabados) fica **depois** dos botões que moram
  dentro da linha. A lição vale para o Semiacabados de hoje; apagar a frase
  apagaria o motivo de a ordem ser aquela.
- **linha 165** — reescrevi de *"mesma notificação"* para *"mesmo aviso"*. Aqui
  "notificação" era o sentido comum da palavra, não o módulo.

Reescrevi também os comentários de `render-de-fundo.js` (citava "a busca de
recados a cada 3 minutos" como um dos três caminhos de fundo — agora são dois),
`abas.js`, `estado.js`, `persistencia.js` e o bloco 21 do CSS.

**Uma coisa que eu deixei de pé de propósito:** o mecanismo `.chamando` /
`.badge.urg` / `.badge.alerta` do menu. Eu tinha escrito no comentário que só
Notificações usava — **estava errado, e a bancada me corrigiu**: Insumos,
Semiacabados e Prestadoras também passam o 4º elemento `tom`. O CSS fica e o
comentário foi corrigido.

---

# 4 · A medida · antes e depois

Mesmo roteiro nos dois binários: boot → 12 s parado → voltar para a aba do
navegador → abrir Tarefas → abrir Pedidos. Instrumento:
`testes/notif-remocao-medida.js`.

| | v8.91 | **v8.92** |
|---|---|---|
| **timers ativos** | **4** | **3** |
| | `10000` · `ligarPresenca 20000` · `ligarSincronia 15000` · **`ligarNotifs 180000`** | `10000` · `ligarPresenca 20000` · `ligarSincronia 15000` |
| **requisições `/rest/v1/notificacoes`** | **2** | **0** |
| **`renderDeFundo()`** | **1** | **0** |
| **erros de página** | 0 | 0 |
| ouvintes de `visibilitychange` | **3** | **2** |
| sino no cabeçalho | sim | **não** |
| aba `notificacoes` no menu | sim | **não** |
| `S.notifs` existe | sim | **não** |
| itens na aba Tarefas | 0 | 0 (mesma base) |

**O `renderDeFundo` que sumiu é o interessante.** Era o `finally` do
`carregarNotifs(silencioso)`: de 3 em 3 minutos, e toda vez que você voltava
para a aba do navegador, o app redesenhava a tela de fundo mesmo sem nada ter
mudado. Era um dos três caminhos que o comentário do `render-de-fundo.js` citava
como causa do "piscar e desfazer tudo". Agora são dois.

*(Os 15 `console.error` da v8.91 e os 12 da v8.92 são todos ruído de bancada —
WebSocket do Realtime bloqueado pelo proxy e 400 de tabelas que o molde não tem.
A diferença de 3 é justamente a rede das notificações sumindo.)*

---

# 5 · A bateria nova · 42 ok · 0 falhas

Duas metades. A segunda é a que importa: remover é fácil; remover **só** o que
se quis é que não é.

**A · o que tinha de sumir** (12 testes) — versão 8.92 · sem sino · sem painel ·
aba fora do menu · `S.notifs` inexistente · **nenhuma das 18 funções `notif*`
sobrou** · nenhum `data-nt-*`/`data-cx` no DOM · `notificacoes` fora de
`ABAS_TODAS` · **aba salva no navegador como `notificacoes` não deixa tela em
branco** (cai no Painel) · zero requisições · nenhum timer de 180.000 ms ·
zero erros no boot.

**B · o que não podia ir junto** (30 testes):

| prova | resultado |
|---|---|
| `toast`, `toastPasso`, `_avisar`, barra de avisos | vivos |
| **`toast()` desenha o aviso de verdade na tela** | ok |
| `renderDeFundo` | vivo |
| `ehAdm()` · `tom()` · `kpi` · `regua` | vivos |
| **`insumos()` — a que morava no fim do arquivo apagado** | **vivo** |
| `insumoPorId` · `movsInsumo` · `entradasNF` · `fornecedorPorId` | vivos |
| `chipPresenca()` acende com companhia | ok |
| busca rápida no cabeçalho | ok |
| **`mtItens()` roda e nenhum item tem origem `notificacao`** | ok |
| a tela Tarefas desenha | ok |
| **Esc continua abrindo-e-fechando a janela** | ok |
| a tecla `s` (era o sino) não faz nada e não estoura | ok |
| a folha de atalhos não promete o que não existe | ok |
| **`+ Novo pedido` abre com SKU e número** | ok |
| Painel · Demanda · Pedidos · Compras · Insumos · Produtos desenham | 6/6 |
| zero erros de página do começo ao fim | ok |

---

# 6 · Regressão dirigida · v8.91 × v8.92

| bateria | v8.91 | v8.92 | regressão nova? |
|---|---|---|---|
| `janelas` (as janelas) | 531 · 0 | **507 · 0** | **não** — 24 testes a menos são as 4 janelas de notificação que deixaram de existir |
| `baseline-numeracao` | 37 · 0 | **37 · 0** | não |
| `novopedido-pisca` | 31 · 0 | **31 · 0** | não |
| `v890-repintar-nao-reabre` | 16 · 0 | **16 · 0** | não |
| `v884-janela-por-cima` | 36 · 0 | **36 · 0** | não |
| `modal-fecha-ou-nao` | 28 · 0 | **28 · 0** | não |
| `v886-prioridade-e-embalar` | 19 · 0 | **19 · 0** | não |
| `dois-bugs-chip-e-tamanho` | 11 · 0 | **11 · 0** | não |
| `etapas-usadas-contrato` | 21 · 0 | **21 · 0** | não |
| **`v891-abrir-sem-piscar`** | 26 · 0 | **26 · 0** | **não** |
| `render-em-excesso` | 8 · 0 | **8 · 0** | não |
| `v885-janela-fecha` | 7 · 0 | **7 · 0** | não |
| `conflito-falso` | 12 · 0 | **12 · 0** | não |
| `demanda-guarda-remocao` | 37 · 0 | **37 · 0** | não |
| `v892-sem-notificacoes` (nova) | — | **42 · 0** | — |

**Quatro baterias quebram igual nas duas versões — baseline antigo, não
regressão**, pela sua regra, e parei de investigá-las nesta versão:

| bateria | v8.91 | v8.92 |
|---|---|---|
| `abas-de-tela-estado` | 44 ok · 2 falhas (3.4 e 8.4) | **igual** |
| `conflito-revisao` | 39 ok · 2 falhas (10.1 e 10.2) | **igual** |
| `meu-trabalho` | estoura em `[data-act="ver-como-equipe"]` | **igual** |
| `criar-pedidos` | estoura em `[data-plan="0"]` | **igual** |
| `presenca` | estoura em `[data-act="ver-presenca"]` | **igual** |

`conflito-falso` e `conflito-revisao` verdes importam aqui: são elas que guardam
a proteção por revisão, e **nada disso foi tocado** — `p_expected_revision`
continua onde estava.

---

# 7 · O que **não** fiz, porque você pediu para não fazer

- **Não mexi no Supabase.** A tabela `notificacoes` e a `pcp_adm` continuam lá,
  intactas. O `FASE3-notificacoes.sql` também.
- **Não removi** `toast`, avisos, conflitos nem `renderDeFundo()`.
- **Não toquei** na proteção por revisão nem em `p_expected_revision`.

Quando quiser apagar a tabela no servidor, é outra etapa e eu escrevo o SQL para
você rodar — não rodo nada em produção.

---

| arquivo | o que é |
|---|---|
| `entrega-v892/PCP-v8.92.html` | md5 `c7866c5ccf059758923bb99a1ce3d2f7` |
| `testes/v892-sem-notificacoes.js` | as duas metades · **42 ok · 0** |
| `testes/notif-remocao-medida.js` | timers · rede · renders de fundo · erros, em qualquer binário |
| `src/insumos/preambulo.js` | as 33 linhas de Insumos que moravam no arquivo apagado |
