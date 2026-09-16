/* ---------- foto que não carrega vira "sem foto", sem drama ----------
   Isto morava num `onerror=` embutido, com aspas escapadas dentro de aspas —
   e o HTML gerado saía com a string cortada no meio, jogando SyntaxError a cada
   imagem quebrada. Um ouvinte resolve sem aspa nenhuma. `error` de imagem não
   borbulha, por isso a captura na fase de descida. */
document.addEventListener("error", (e) => {
  const img = e.target;
  if (!img || img.tagName !== "IMG" || !img.dataset || !img.dataset.semfoto) return;
  const cls = img.dataset.semfoto;
  const ph = document.createElement(cls === "foto-ph" ? "span" : "div");
  ph.className = cls;
  ph.textContent = "sem foto";
  img.replaceWith(ph);
}, true);

/* drag & drop */
