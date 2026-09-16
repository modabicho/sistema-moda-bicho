document.addEventListener("dragover", (e) => {
  const dz = e.target.closest?.(".dz");
  if (dz) { e.preventDefault(); dz.classList.add("drag"); }
});
document.addEventListener("dragleave", (e) => e.target.closest?.(".dz")?.classList.remove("drag"));
document.addEventListener("drop", (e) => {
  const dz = e.target.closest?.(".dz");
  if (!dz) return;
  e.preventDefault(); dz.classList.remove("drag");
  const file = e.dataTransfer.files?.[0];
  if (!file) return;
  if (dz.id === "dz-csv") importarCsv(file);
  else if (dz.id === "dz-vinculo") importarVinculo(file, "produtos");
  else if (dz.id === "dz-fotos") importarVinculo(file, "fotos");
  else if (dz.id === "dz-nfe") importarXmlNFe(file);
  else if (dz.id === "dz-nfe") importarXmlNFe(file);
  else if (dz.id === "dz-catalogo") importarVinculo(file, "catalogo");
});

