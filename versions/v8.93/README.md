# v8.93 — remoção completa da aba Hoje

**MD5 informado:** `e07b7890839cc4d98c54590f16e81472`

**Base:** v8.92, preservada e intocada.

**Redução informada:** 662 linhas a menos.

## Escopo

A aba/menu `Hoje` foi removida do PCP. A remoção incluiu também a tela `Meu trabalho agora`, que apesar de morar em `telas/meu-trabalho.js` era chamada exclusivamente por `painel.js` e fazia parte funcionalmente da experiência Hoje para usuários não-ADM.

## Levantamento antes da remoção

Em `telas/painel.js` havia cinco funções exclusivas, sem usos fora do arquivo:
- `viewPainel`
- `painelFluxo`
- `hojeExcecoes`
- `hojeGargalos`
- `painelAdm`

Também eram exclusivos da aba Hoje:
- `data-pipe` e seu handler;
- ações `ver-como-equipe` / `ver-como-adm`;
- `S.meuTrab.comoEquipe`;
- `IC.painel`;
- CSS `.hj-*`, `.passo-fluxo`, `.fluxo`, `.t-hoje` distribuído por quatro folhas de estilo.

Não havia atalho de teclado específico para Hoje.

## Dependência inversa descoberta

`viewMeuTrabalho()` morava em `telas/meu-trabalho.js`, mas o único chamador do app era `painel.js:16`. A aba Tarefas usa `viewTarefas`, em `telas/pedidos.js`, e não dependia dessa tela.

Por isso saíram junto:
- `viewMeuTrabalho`
- `mtItens`
- `mtLinha`
- `mtGrupos`
- `mtOrdem`
- `mtAberto`
- constantes `MT_*`
- handler `data-mtgrupo`
- estado `S.meuTrab`
- regras CSS `.mt-*`

O teste antigo `testes/meu-trabalho.js` foi aposentado como `meu-trabalho.RETIRADO.js`, pois media uma tela removida por decisão de produto.

## Aba padrão e prevenção de tela branca

A aba `Hoje`/`painel` era padrão do app em múltiplos pontos. O risco de tela branca foi reproduzido: `relatorios.js` desestrutura `TITULOS[S.aba]` diretamente, então um `S.aba = "painel"` residual causava `undefined is not iterable`.

A nova regra ficou:
- **Pedidos** é a aba padrão;
- se o usuário não puder abrir Pedidos, usar uma aba válida disponível, como Tarefas;
- `pcp:aba = "painel"` salvo no navegador deve cair em Pedidos, sem tela branca;
- primeira abertura, F5 com aba inválida, sair/entrar e fechamento da última aba interna seguem a mesma regra de fallback.

## Navegação e mobile

`data-pipe` não oferecia destino exclusivo: a aba Pedidos já possui sua própria fileira de alertas para atraso, adiantar, atraso de conferência, avisar, material, problema e fila.

A barra inferior mobile passou a:

**Pedidos · Tarefas · Demanda · Mais**

Medição informada em 390×780, com quatro alvos e sem buraco.

## Bancadas ajustadas

Foram reescritas três bancadas para refletir o produto atual, sem alterar o comportamento do app:
- `abas-de-tela-estado`: trocou Hoje por Produtos no cenário de exemplo;
- `v892-sem-notificacoes`: deixou de prender a versão em 8.92;
- `presenca`: deixou de forçar `S.aba = 'painel'`, cenário que revelou o crash durante a investigação.

## Pendência antiga preservada

O filtro `cobrar` já não tinha entrada na v8.92. Foi identificado como sobra anterior e não foi alterado nesta versão.

## Resultado

Zero regressão nova informada. A v8.92 continua com seu MD5 original e não foi reescrita.
