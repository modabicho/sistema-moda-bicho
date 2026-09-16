# v8.100 — Simplificação segura (sem mudança de comportamento)

**Data:** 16/09/2026
**Arquivo:** `PCP-v8.100.html`
**MD5 (repositório, LF):** `3296f5a1de067bdee9481d5c5058d4af`
**Tamanho:** 2.103.807 bytes · 31.842 linhas
**Marcador:** `<!--PCP:8.100-->` · `VERSAO = "8.100"`
**Base:** v8.99 (`8ba314bba0c39ece264951bf6826bbfb`), validada em uso real

> **Numeração:** `versaoNum("8.100")` = 8×1000 + 100 = **8100**, maior que 8.99 (8099), então a atualização é detectada. O marcador casa com `/<!--PCP:([\d.]+)-->/` e cabe nos 60 bytes lidos.

## Escopo

Somente os itens 1, 2 e 3 da dívida de simplificação registrada na v8.99. Os itens 4, 5 e 6 (opção `eco`, guardas do reenvio `r2`, seleção dos avisos) **não** foram tocados.

## Itens aplicados

### 1 · `pxSincronizarConfirmado` — ramo antigo removido
- **Prova:** `telaAplicarRegistro` é declaração de função no nível mais alto (coluna 0) do mesmo `<script>` (linhas 2816–31848). Há uma única declaração e nenhuma reatribuição no app nem nos testes. Por içamento, `typeof telaAplicarRegistro === "function"` é sempre verdadeiro, e o ramo antigo nunca roda.
- **Mudança:** `if (typeof …) { telaAplicarRegistro(…); return true; }` + 5 linhas de ramo antigo → `telaAplicarRegistro(…); return true;`.

### 2 · `pxDrenar` — `typeof` redundante removido
- **Prova de ordem:** o único chamador é `telaAbrir` (L5349 na v8.99), que passa por 11 `await` antes. Ele sempre roda depois de o script inteiro ter sido avaliado, então `let TELA_ENVIO_EM_CURSO` já está inicializado.
- **Prova independente da ordem:** a referência continua **dentro do mesmo `try … catch`**. Num TDZ hipotético, `typeof` sobre `let` também lança, e o `catch` captura nos dois casos. O `await` é o mesmo, sem tick de microtarefa a mais.
- **Mudança:** `if (typeof TELA_ENVIO_EM_CURSO !== "undefined" && TELA_ENVIO_EM_CURSO)` → `if (TELA_ENVIO_EM_CURSO)`.

### 3 · `telaDesfazerNaoConfirmados` — teste redundante removido
- **Prova:** `regVelho = !!(reg && foto.revision != null && …)`; verdadeiro implica `foto.revision != null`. `foto` é `const`, já conferido (`!foto → continue`), e não é mutado entre as duas linhas (o laço escreve em `alvo`, outro objeto).
- **Mudança:** `if (regVelho && foto.revision != null)` → `if (regVelho)`.

## Itens recusados

Nenhum dos três. Os itens 4, 5 e 6 ficaram fora do escopo, como pedido.

## Diff (v8.99 → v8.100)

```
1       <!--PCP:8.99-->                                  → <!--PCP:8.100-->
4559-66 if (typeof telaAplicarRegistro === "function") {   → telaAplicarRegistro(app.id, reg, { minha: true, base: false });
          telaAplicarRegistro(...); return true; }
        const p = …; if (p) {…}; telaGuardar…; rtMinha…
4576    if (typeof TELA_ENVIO_EM_CURSO !== "undefined" && TELA_ENVIO_EM_CURSO) → if (TELA_ENVIO_EM_CURSO)
5439    if (regVelho && foto.revision != null)            → if (regVelho)
11141   const VERSAO = "8.99";                             → const VERSAO = "8.100";
```

**Linhas:** 31.849 → 31.842 (**−7**), −498 bytes.

## Testes (mesma página, mesmo navegador, mesmas sementes)

| | v8.99 | v8.100 |
|---|---|---|
| `conflito-pedido` completa (A, B, C, C2, D, D2, E, Esorteio) | 8 ok · 0 | **8 ok · 0** |
| Toasts por cenário | A0 B0 C0 C2:0 D1 D2:1 E0 Esorteio0 | **idêntico** |
| Captura com ordem sorteada (30 sementes) | 30 ok · 0 toast | **30 ok · 0 toast** |
| Conflito verdadeiro sorteado (D, D2, C, C2 × 6) | 24/24 | **24/24, mesmo número de toasts** |
| `datas-festivas-uniao` | 78 ok · 0 | **78 ok · 0** |
| Caminhos diretos dos itens 1–3 (console) | referência | **JSON idêntico** |
| Abertura com token válido | 242 requisições Supabase, todas 200 | **242, todas 200** |

**Caminhos diretos** (as baterias não passam pelo dreno da abertura nem pelo desfazer com registro velho), executados nas duas versões com o servidor falso da bancada:
- **Dreno:** espera a rodada em curso; confirma a gravação; foto, pedido e eco em 6; revisão anotada como minha; base intacta.
- **Replay velho no dreno:** não rebaixa.
- **Resposta sem registro:** devolve `false`.
- **Rodada em curso que rejeita:** o dreno segue e libera a marca.
- **Desfazer com registro velho, novo e foto sem revisão:** mesmos valores.

A fila real do navegador de teste ficou intacta (36 → 36).

**Observação:** um carregamento intermediário mostrou 8 respostas 401 no console. Eram do token vencido antes da renovação automática; recarregadas com o token novo, v8.99 e v8.100 fizeram 242 requisições, todas 200.

## Não alterado

Conflito, autoria, eco, fila, Realtime, `mgClassificar`, `telaAplicarRegistro`, ordem e seleção dos avisos, Supabase, Produto, Demanda, Datas Festivas. v8.97, v8.98 e v8.99 intactas.

## Riscos conhecidos

- **Ordem de carga futura:** se `telaAplicarRegistro` for movida para outro arquivo carregado **depois** de `pxSincronizarConfirmado` (reorganização estrutural), o item 1 deixa de ter a garantia de içamento. O manifesto precisa manter essa dependência.
- **Validação:** a equivalência foi medida na bancada, com servidor simulado, e por prova estática. Não houve nova validação no app publicado; como o comportamento é idêntico ao da v8.99, a validação real dela continua valendo.
