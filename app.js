// ---------- Utilitários básicos ----------

function showError(message) {
  const el = document.getElementById("errorArea");
  const uploadPanel = document.getElementById("uploadPanel");
  const newFileLabel = document.getElementById("newFileLabel");

  if (!message) {
    el.style.display = "none";
    el.textContent = "";
  } else {
    el.style.display = "block";
    el.textContent = message;
    // Em caso de erro, volta a mostrar painel de upload e esconde o texto
    if (uploadPanel) uploadPanel.style.display = "flex";
    if (newFileLabel) newFileLabel.style.display = "none";
  }
}

function parseCSV(text) {
  const rows = [];
  let current = "";
  let inQuotes = false;
  let row = [];

  text = text.replace(/\r/g, "");

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === "," && !inQuotes) {
      row.push(current);
      current = "";
    } else if (c === "\n" && !inQuotes) {
      row.push(current);
      current = "";
      if (row.length > 1 || (row.length === 1 && row[0].trim() !== "")) {
        rows.push(row);
      }
      row = [];
    } else {
      current += c;
    }
  }
  if (current || row.length) {
    row.push(current);
    if (row.length > 1 || (row.length === 1 && row[0].trim() !== "")) {
      rows.push(row);
    }
  }

  if (!rows.length) return { headers: [], data: [] };
  const headers = rows[0];
  const data = rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = r[idx] !== undefined ? r[idx] : "";
    });
    return obj;
  });
  return { headers, data };
}

function parseBrazilianNumber(value) {
  if (value === null || value === undefined) return 0;
  let v = String(value).trim();
  if (!v) return 0;

  v = v.replace(/[R$\s]/g, "");
  if (!v) return 0;

  if (v.includes(",")) {
    v = v.replace(/\./g, "").replace(",", ".");
  }
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function parsePercent(value) {
  if (value === null || value === undefined) return null;
  let v = String(value).trim();
  if (!v) return null;
  v = v.replace("%", "");
  if (v.includes(",")) {
    v = v.replace(/\./g, "").replace(",", ".");
  }
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function parseOrderDate(str) {
  if (!str) return null;
  const cleaned = str.trim().replace(" ", "T");
  const d = new Date(cleaned);
  if (isNaN(d.getTime())) return null;
  return d;
}

function formatCurrency(value) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  });
}

function formatPercent(value) {
  if (value === null || value === undefined || isNaN(value)) return "-";
  return (
    value.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + "%"
  );
}

function formatDateISO(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateBR(d) {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

// ---------- Estado global ----------

let rawRows = [];
let processedRows = [];
let globalMinDate = null;
let globalMaxDate = null;

// filtros adicionais (Sub2 / Sub3 clicados)
let clickedSub2 = null;
let clickedSub3 = null;

// Campos da UI
const fileInput = document.getElementById("fileInput");
const fileNameEl = document.getElementById("fileName");
const mainContent = document.getElementById("mainContent");
const uploadPanel = document.getElementById("uploadPanel");
const newFileLabel = document.getElementById("newFileLabel");

// Filtros
const dateFromInput = document.getElementById("dateFrom");
const dateToInput = document.getElementById("dateTo");
const channelFilter = document.getElementById("channelFilter");
const subFilter = document.getElementById("subFilter");

// Resumo
const summaryTotalOrdersEl = document.getElementById("summaryTotalOrders");
const summaryOrdersDetailEl = document.getElementById("summaryOrdersDetail");
const summaryTotalSalesEl = document.getElementById("summaryTotalSales");
const summaryAvgTicketEl = document.getElementById("summaryAvgTicket");
const summaryTotalCommissionEl = document.getElementById(
  "summaryTotalCommission"
);
const summaryAvgCommissionEl = document.getElementById(
  "summaryAvgCommission"
);
const summaryAvgRateEl = document.getElementById("summaryAvgRate");
const summaryPeriodLabelEl = document.getElementById("summaryPeriodLabel");

// Tabelas
const tableSub1Body = document.getElementById("tableSub1");
const tableSub2Body = document.getElementById("tableSub2");
const tableSub3Body = document.getElementById("tableSub3");
const tableChannelBody = document.getElementById("tableChannel");

// ---------- Interação "Subir nova planilha" ----------

if (newFileLabel) {
  newFileLabel.addEventListener("click", () => {
    if (fileInput) fileInput.click();
  });
}

// ---------- Carregamento de arquivo ----------

fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  fileNameEl.textContent = file.name;

  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      showError("");
      const text = ev.target.result;
      const { headers, data } = parseCSV(text);

      if (!headers.length || !data.length) {
        showError(
          "Não foi possível ler dados do CSV. Verifique se o arquivo está correto."
        );
        mainContent.style.display = "none";
        return;
      }

      const requiredCols = [
        "Horário do pedido",
        "Valor de Compra(R$)",
        "Comissão líquida do afiliado(R$)",
        "Taxa de contrato do afiliado",
        "Sub_id1",
        "Sub_id2",
        "Sub_id3",
        "Canal",
      ];

      const missing = requiredCols.filter((c) => !headers.includes(c));
      if (missing.length) {
        showError(
          "Colunas obrigatórias ausentes no CSV: " + missing.join(", ")
        );
        mainContent.style.display = "none";
        return;
      }

      rawRows = data;
      processRows();
      setupFilters();
      applyFiltersAndRender();
      mainContent.style.display = "flex";

      // Esconde painel de upload e mostra texto "Subir nova planilha"
      if (uploadPanel) uploadPanel.style.display = "none";
      if (newFileLabel) newFileLabel.style.display = "inline-block";
    } catch (err) {
      console.error(err);
      showError(
        "Ocorreu um erro ao processar o arquivo. Verifique se o CSV está no formato correto."
      );
      mainContent.style.display = "none";
    }
  };
  reader.readAsText(file, "utf-8");
});

// ---------- Processamento ----------

function processRows() {
  processedRows = [];
  globalMinDate = null;
  globalMaxDate = null;
  clickedSub2 = null;
  clickedSub3 = null;

  for (const row of rawRows) {
    const orderDate = parseOrderDate(row["Horário do pedido"]);
    const orderValue = parseBrazilianNumber(row["Valor de Compra(R$)"]);
    const commissionNet = parseBrazilianNumber(
      row["Comissão líquida do afiliado(R$)"]
    );
    const rate = parsePercent(row["Taxa de contrato do afiliado"]);
    const sub1 = (row["Sub_id1"] || "").trim() || "—";
    const sub2 = (row["Sub_id2"] || "").trim() || "—";
    const sub3 = (row["Sub_id3"] || "").trim() || "—";
    const channel = (row["Canal"] || "").trim() || "—";

    if (orderDate) {
      if (!globalMinDate || orderDate < globalMinDate) globalMinDate = orderDate;
      if (!globalMaxDate || orderDate > globalMaxDate) globalMaxDate = orderDate;
    }

    processedRows.push({
      orderDate,
      orderValue,
      commissionNet,
      rate,
      sub1,
      sub2,
      sub3,
      channel,
      raw: row,
    });
  }
}

// ---------- Filtros ----------

function setupFilters() {
  if (globalMinDate && globalMaxDate) {
    dateFromInput.value = formatDateISO(globalMinDate);
    dateToInput.value = formatDateISO(globalMaxDate);
  } else {
    dateFromInput.value = "";
    dateToInput.value = "";
  }

  const channels = Array.from(new Set(processedRows.map((r) => r.channel))).sort();
  channelFilter.innerHTML = '<option value="__all">Todos os canais</option>';
  channels.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    channelFilter.appendChild(opt);
  });

  const subIds = Array.from(new Set(processedRows.map((r) => r.sub1))).sort();
  subFilter.innerHTML = '<option value="__all">Todos os Sub IDs</option>';
  subIds.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s;
    subFilter.appendChild(opt);
  });

  dateFromInput.addEventListener("change", applyFiltersAndRender);
  dateToInput.addEventListener("change", applyFiltersAndRender);
  channelFilter.addEventListener("change", applyFiltersAndRender);
  subFilter.addEventListener("change", applyFiltersAndRender);
}

function getFilteredRows() {
  let rows = processedRows.slice();

  const fromVal = dateFromInput.value;
  const toVal = dateToInput.value;

  let fromDate = null;
  let toDate = null;

  if (fromVal) {
    fromDate = new Date(fromVal + "T00:00:00");
  }
  if (toVal) {
    toDate = new Date(toVal + "T23:59:59");
  }

  if (fromDate) {
    rows = rows.filter((r) => r.orderDate && r.orderDate >= fromDate);
  }
  if (toDate) {
    rows = rows.filter((r) => r.orderDate && r.orderDate <= toDate);
  }

  const channelVal = channelFilter.value;
  if (channelVal && channelVal !== "__all") {
    rows = rows.filter((r) => r.channel === channelVal);
  }

  const subVal = subFilter.value;
  if (subVal && subVal !== "__all") {
    rows = rows.filter((r) => r.sub1 === subVal);
  }

  if (clickedSub2) {
    rows = rows.filter((r) => r.sub2 === clickedSub2);
  }
  if (clickedSub3) {
    rows = rows.filter((r) => r.sub3 === clickedSub3);
  }

  return rows;
}

// ---------- Renderização ----------

function applyFiltersAndRender() {
  const rows = getFilteredRows();

  if (!rows.length) {
    summaryTotalOrdersEl.textContent = "0";
    summaryOrdersDetailEl.textContent = "Nenhuma linha no filtro.";
    summaryTotalSalesEl.textContent = formatCurrency(0);
    summaryAvgTicketEl.textContent = "Ticket médio: R$ 0,00";
    summaryTotalCommissionEl.textContent = formatCurrency(0);
    summaryAvgCommissionEl.textContent = "Comissão média por pedido: R$ 0,00";
    summaryAvgRateEl.textContent = "-";
    summaryPeriodLabelEl.textContent = "Período: -";
    renderSubTable(tableSub1Body, [], "sub1");
    renderSubTable(tableSub2Body, [], "sub2");
    renderSubTable(tableSub3Body, [], "sub3");
    renderChannelTable([]);
    return;
  }

  const totalOrders = rows.length;
  const totalSales = rows.reduce((sum, r) => sum + r.orderValue, 0);

  const rowsWithCommission = rows.filter((r) => r.commissionNet > 0);
  const commissionTotal = rowsWithCommission.reduce(
    (sum, r) => sum + r.commissionNet,
    0
  );
  const avgCommission =
    rowsWithCommission.length > 0
      ? commissionTotal / rowsWithCommission.length
      : 0;

  const rates = rowsWithCommission
    .map((r) => r.rate)
    .filter((v) => v !== null && !isNaN(v));
  const avgRate =
    rates.length > 0
      ? rates.reduce((a, b) => a + b, 0) / rates.length
      : null;

  const avgTicket = totalOrders > 0 ? totalSales / totalOrders : 0;

  summaryTotalOrdersEl.textContent = totalOrders.toString();
  summaryOrdersDetailEl.textContent =
    rowsWithCommission.length +
    " pedido(s) com comissão registrada no filtro.";
  summaryTotalSalesEl.textContent = formatCurrency(totalSales);
  summaryAvgTicketEl.textContent =
    "Ticket médio: " + formatCurrency(avgTicket);
  summaryTotalCommissionEl.textContent = formatCurrency(commissionTotal);
  summaryAvgCommissionEl.textContent =
    "Comissão média por pedido: " + formatCurrency(avgCommission);
  summaryAvgRateEl.textContent = avgRate !== null ? formatPercent(avgRate) : "-";

  const withDates = rows.filter((r) => r.orderDate);
  let minD = null;
  let maxD = null;
  for (const r of withDates) {
    if (!minD || r.orderDate < minD) minD = r.orderDate;
    if (!maxD || r.orderDate > maxD) maxD = r.orderDate;
  }
  if (minD && maxD) {
    summaryPeriodLabelEl.textContent =
      "Período: " + formatDateBR(minD) + " a " + formatDateBR(maxD);
  } else {
    summaryPeriodLabelEl.textContent = "Período: -";
  }

  renderSubTable(tableSub1Body, rowsWithCommission, "sub1");
  renderSubTable(tableSub2Body, rowsWithCommission, "sub2");
  renderSubTable(tableSub3Body, rowsWithCommission, "sub3");
  renderChannelTable(rowsWithCommission);
}

function renderSubTable(tbody, rows, keyField) {
  tbody.innerHTML = "";

  if (!rows.length || !keyField) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 4;
    td.className = "empty";
    td.textContent = "Nenhuma comissão no filtro.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  const map = new Map();
  for (const r of rows) {
    const key = r[keyField] || "—";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  }

  const entries = Array.from(map.entries()).sort((a, b) => {
    const totalA = a[1].reduce((sum, r) => sum + r.commissionNet, 0);
    const totalB = b[1].reduce((sum, r) => sum + r.commissionNet, 0);
    return totalB - totalA;
  });

  for (const [key, groupRows] of entries) {
    const pedidos = groupRows.length;
    const totalComissao = groupRows.reduce(
      (sum, r) => sum + r.commissionNet,
      0
    );
    const rates = groupRows
      .map((r) => r.rate)
      .filter((v) => v !== null && !isNaN(v));
    const avgRate =
      rates.length > 0
        ? rates.reduce((a, b) => a + b, 0) / rates.length
        : null;

    const tr = document.createElement("tr");
    tr.classList.add("row-clickable");

    const tdKey = document.createElement("td");
    tdKey.textContent = key;
    tr.appendChild(tdKey);

    const tdPedidos = document.createElement("td");
    tdPedidos.textContent = pedidos.toString();
    tr.appendChild(tdPedidos);

    const tdComissao = document.createElement("td");
    tdComissao.className = "text-right text-green";
    tdComissao.textContent = formatCurrency(totalComissao);
    tr.appendChild(tdComissao);

    const tdRate = document.createElement("td");
    tdRate.textContent = avgRate !== null ? formatPercent(avgRate) : "-";
    tr.appendChild(tdRate);

    // click = aplicar filtro por esse sub_id (conforme tabela)
    tr.addEventListener("click", () => {
      if (keyField === "sub1") {
        const current = subFilter.value;
        subFilter.value = current === key ? "__all" : key;
      } else if (keyField === "sub2") {
        clickedSub2 = clickedSub2 === key ? null : key;
      } else if (keyField === "sub3") {
        clickedSub3 = clickedSub3 === key ? null : key;
      }
      applyFiltersAndRender();
    });

    // marca linha ativa quando filtro está aplicado
    if (
      (keyField === "sub1" && subFilter.value === key) ||
      (keyField === "sub2" && clickedSub2 === key) ||
      (keyField === "sub3" && clickedSub3 === key)
    ) {
      tr.classList.add("row-active");
    }

    tbody.appendChild(tr);
  }
}

function renderChannelTable(rows) {
  tableChannelBody.innerHTML = "";

  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.className = "empty";
    td.textContent = "Nenhuma comissão no filtro.";
    tr.appendChild(td);
    tableChannelBody.appendChild(tr);
    return;
  }

  const map = new Map();
  for (const r of rows) {
    const key = r.channel || "—";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  }

  const entries = Array.from(map.entries()).sort((a, b) => {
    const totalA = a[1].reduce((sum, r) => sum + r.commissionNet, 0);
    const totalB = b[1].reduce((sum, r) => sum + r.commissionNet, 0);
    return totalB - totalA;
  });

  for (const [channel, groupRows] of entries) {
    const pedidos = groupRows.length;
    const vendas = groupRows.reduce((sum, r) => sum + r.orderValue, 0);
    const comissao = groupRows.reduce(
      (sum, r) => sum + r.commissionNet,
      0
    );
    const rates = groupRows
      .map((r) => r.rate)
      .filter((v) => v !== null && !isNaN(v));
    const avgRate =
      rates.length > 0
        ? rates.reduce((a, b) => a + b, 0) / rates.length
        : null;

    const tr = document.createElement("tr");
    tr.classList.add("row-clickable");

    const tdChannel = document.createElement("td");
    tdChannel.textContent = channel;
    tr.appendChild(tdChannel);

    const tdPedidos = document.createElement("td");
    tdPedidos.textContent = pedidos.toString();
    tr.appendChild(tdPedidos);

    const tdVendas = document.createElement("td");
    tdVendas.className = "text-right";
    tdVendas.textContent = formatCurrency(vendas);
    tr.appendChild(tdVendas);

    const tdComissao = document.createElement("td");
    tdComissao.className = "text-right text-green";
    tdComissao.textContent = formatCurrency(comissao);
    tr.appendChild(tdComissao);

    const tdRate = document.createElement("td");
    tdRate.textContent = avgRate !== null ? formatPercent(avgRate) : "-";
    tr.appendChild(tdRate);

    tr.addEventListener("click", () => {
      const current = channelFilter.value;
      channelFilter.value = current === channel ? "__all" : channel;
      applyFiltersAndRender();
    });

    if (channelFilter.value === channel) {
      tr.classList.add("row-active");
    }

    tableChannelBody.appendChild(tr);
  }
}
