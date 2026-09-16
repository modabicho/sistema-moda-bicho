/* ==========================================================================
   INSUMOS
   Produto é o que a Moda Bicho vende. Insumo é o que ela compra para produzir:
   tecido, EVA, elástico, cola, embalagem, etiqueta, aviamento.

   A decisão que sustenta tudo aqui: **o saldo não é um campo, é uma conta**.
   Nenhuma tela grava "estoque = 515". O que se grava é o movimento — entrou
   500 pela NF 541, saiu 80 no pedido 1254, ajustou −5 no inventário — e o
   saldo é a soma. É o que permite responder "de onde veio esse número?" seis
   meses depois, e é o que impede dois lugares do app discordarem sobre o
   mesmo estoque.
   ========================================================================== */
const INS_TIPOS = {
  entrada: { nome: "Entrada", sinal: +1, tom: "ok" },
  consumo: { nome: "Consumo", sinal: -1, tom: "saida" },
  ajuste:  { nome: "Ajuste", sinal: 0, tom: "ajuste" },   /* o sinal vem do valor digitado */
  perda:   { nome: "Perda", sinal: -1, tom: "saida" },
  devolucao: { nome: "Devolução ao fornecedor", sinal: -1, tom: "saida" },
};
/* unidades que aparecem na fábrica — a lista existe para o campo não virar
   texto livre, onde "un", "UN", "unid" e "unidade" viram quatro coisas */
const INS_UNIDADES = ["un", "pç", "m", "cm", "m²", "kg", "g", "L", "mL", "rolo", "chapa", "folha", "pacote", "caixa", "par", "metro linear"];
const normIns = (x) => String(x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
const INS_CATEGORIAS = ["Tecido", "EVA", "Embalagem", "Elástico", "Cola e adesivo", "Etiqueta", "Aviamento", "Papelaria", "Outro"];

/* o fornecedor mora em S.cad.fornecedores desde a 7.28 — aqui só damos nome ao acesso */
const fornecedorPorId = (id) => (S.cad?.fornecedores || []).find((f) => f.id === id) || null;
const insumos = () => S.insumos || (S.insumos = []);
const movsInsumo = () => S.movInsumo || (S.movInsumo = []);
const entradasNF = () => S.entradas || (S.entradas = []);
const insumoPorId = (id) => insumos().find((i) => i.id === id) || null;
const insumoPorCodigo = (c) => insumos().find((i) => String(i.codigo || "").toLowerCase() === String(c || "").trim().toLowerCase()) || null;

