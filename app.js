const PAGE_SIZE = 30;
const PRODUCT_FILE = "DATA BARANG.csv";

let products = [];
let cart = new Map();
let visibleLimit = PAGE_SIZE;
let searchTerm = "";
let activeCategory = null;

const productGrid = document.querySelector("#productGrid");
const categoryFilters = document.querySelector("#categoryFilters");
const searchInput = document.querySelector("#searchInput");
const statusMessage = document.querySelector("#statusMessage");
const productCount = document.querySelector("#productCount");
const catalogTitle = document.querySelector("#catalogTitle");
const emptyResults = document.querySelector("#emptyResults");
const loadMoreButton = document.querySelector("#loadMoreButton");
const cartDialog = document.querySelector("#cartDialog");
const cartItems = document.querySelector("#cartItems");
const emptyCartMessage = document.querySelector("#emptyCartMessage");

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function formatPrice(price) {
  return `Rp ${new Intl.NumberFormat("id-ID").format(price)}`;
}

function formatAmount(amount) {
  return new Intl.NumberFormat("id-ID").format(amount);
}

function parseCsv(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const delimiterCounts = new Map([[",", 0], [";", 0], ["\t", 0]]);
  let firstLineQuoted = false;
  for (let index = 0; index < firstLine.length; index += 1) {
    if (firstLine[index] === '"') {
      if (firstLineQuoted && firstLine[index + 1] === '"') index += 1;
      else firstLineQuoted = !firstLineQuoted;
    } else if (!firstLineQuoted && delimiterCounts.has(firstLine[index])) {
      delimiterCounts.set(firstLine[index], delimiterCounts.get(firstLine[index]) + 1);
    }
  }
  const delimiter = [...delimiterCounts].reduce(
    (best, current) => current[1] > best[1] ? current : best,
    [",", 0],
  )[0];
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field.trim());
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error("Ada tanda kutip yang belum ditutup di dalam CSV.");
  row.push(field.trim());
  if (row.some((cell) => cell !== "")) rows.push(row);
  return rows;
}

function normalizeHeader(value) {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function parseQuantity(value) {
  const normalized = value.trim().replace(/\s/g, "");
  if (!normalized) return NaN;

  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");
  let numeric = normalized;

  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const groupingSeparator = decimalSeparator === "," ? /\./g : /,/g;
    numeric = normalized.replace(groupingSeparator, "").replace(decimalSeparator, ".");
  } else {
    numeric = normalized.replace(",", ".");
  }

  const quantity = Number(numeric);
  return Number.isFinite(quantity) && quantity >= 0 ? quantity : NaN;
}

function formatQuantity(quantity) {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(quantity);
}

function parsePrice(value) {
  const normalized = value.trim().replace(/[^\d.,-]/g, "");
  if (!normalized || normalized.startsWith("-")) return NaN;

  let numeric = normalized;
  if (numeric.includes(",") && numeric.includes(".")) {
    numeric = numeric.replace(/\./g, "").replace(",", ".");
  } else if (numeric.includes(",")) {
    numeric = numeric.replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(numeric)) {
    numeric = numeric.replace(/\./g, "");
  }

  const price = Number(numeric);
  return Number.isFinite(price) && Number.isSafeInteger(Math.round(price))
    ? Math.round(price)
    : NaN;
}

function readProducts(csvText) {
  const rows = parseCsv(csvText.replace(/^\uFEFF/, ""));
  if (rows.length < 2) throw new Error(`File ${PRODUCT_FILE} belum memiliki data produk.`);

  const headers = rows[0].map(normalizeHeader);
  const columnAliases = {
    code: ["kode", "kodeitem", "kodebarang"],
    name: ["nama", "namaitem", "namabarang", "namaproduk"],
    unit: ["satuan", "unit"],
    type: ["jenis", "kategori", "category"],
  };
  for (let tier = 1; tier <= 4; tier += 1) {
    columnAliases[`quantity${tier}`] = [`jml${tier}`, `jumlah${tier}`];
    columnAliases[`price${tier}`] = [`harga${tier}`, `hargajml${tier}`];
  }
  const columnIndexes = Object.fromEntries(
    Object.entries(columnAliases).map(([field, aliases]) => [
      field,
      headers.findIndex((header) => aliases.includes(header)),
    ]),
  );
  const requiredFields = ["code", "name", "unit", "type", "quantity1", "price1"];
  const missingColumns = requiredFields.filter((field) => columnIndexes[field] < 0);

  if (missingColumns.length) {
    throw new Error("CSV wajib berisi kolom Kode Item, Nama Item, Satuan, Jml 1, dan Harga Jml 1.");
  }

  const parsedProducts = [];
  let skippedRows = 0;

  for (const cells of rows.slice(1)) {
    const code = (cells[columnIndexes.code] || "").trim();
    const name = (cells[columnIndexes.name] || "").trim();
    const unit = (cells[columnIndexes.unit] || "").trim();
    const type = (cells[columnIndexes.type] || "").trim() || "Tanpa Jenis";
    const tiers = [];
    for (let tier = 1; tier <= 4; tier += 1) {
      const quantity = parsePrice(cells[columnIndexes[`quantity${tier}`]] || "");
      const price = parsePrice(cells[columnIndexes[`price${tier}`]] || "");
      if (quantity > 0 && price > 0) tiers.push({ maxQuantity: quantity, price });
    }

    if (
      !code
      || !name
      || !unit
      || tiers.length === 0
    ) {
      skippedRows += 1;
      continue;
    }

    parsedProducts.push({
      id: parsedProducts.length,
      code,
      name,
      unit,
      type,
      tiers,
    });
  }

  return { products: parsedProducts, skippedRows };
}

function getMatchingProducts() {
  return products.filter((product) => (
    (activeCategory === null || product.type === activeCategory)
    && (
      !searchTerm
      || product.code.toLocaleLowerCase("id-ID").includes(searchTerm)
      || product.name.toLocaleLowerCase("id-ID").includes(searchTerm)
    )
  ));
}

function renderCategoryFilters() {
  const categoryCounts = new Map();
  for (const product of products) {
    categoryCounts.set(product.type, (categoryCounts.get(product.type) || 0) + 1);
  }
  const categories = [...categoryCounts.keys()].sort((first, second) => (
    categoryCounts.get(second) - categoryCounts.get(first)
    || first.localeCompare(second, "id")
  ));

  categoryFilters.innerHTML = `
    <button
      class="category-chip ${activeCategory === null ? "is-active" : ""}"
      type="button"
      data-category-all
      aria-pressed="${activeCategory === null}"
    >Semua Item</button>
    ${categories.map((category) => `
      <button
        class="category-chip ${activeCategory === category ? "is-active" : ""}"
        type="button"
        data-category="${escapeHtml(category)}"
        aria-pressed="${activeCategory === category}"
      >${escapeHtml(category)}</button>
    `).join("")}
  `;
}

function getPriceTier(product, quantity) {
  const tierIndex = product.tiers.findIndex(
    (tier, index) => index === product.tiers.length - 1 || quantity <= tier.maxQuantity,
  );
  return product.tiers[Math.max(tierIndex, 0)];
}

function getTierStart(product, tierIndex) {
  return tierIndex === 0 ? 1 : product.tiers[tierIndex - 1].maxQuantity + 1;
}

function renderPriceBreakdown(product) {
  const visibleTiers = product.tiers.filter((tier, index) => (
    index === 0 || tier.price !== product.tiers[index - 1].price
  ));

  if (visibleTiers.length === 1) {
    return `<p class="price-breakdown single-tier">Harga ${escapeHtml(product.unit)}: ${formatAmount(visibleTiers[0].price)}</p>`;
  }

  return `
    <div class="price-breakdown" aria-label="Rincian harga bertingkat">
      ${visibleTiers.map((tier) => {
        const index = product.tiers.indexOf(tier);
        const quantity = getTierStart(product, index);
        const breakdown = index === 0
          ? `Beli ${quantity} ${escapeHtml(product.unit)} = ${formatAmount(tier.price)}`
          : `Beli ${quantity} ${escapeHtml(product.unit)} x ${formatAmount(tier.price)} = ${formatAmount(tier.price * quantity)}`;
        return `<p>${breakdown}</p>`;
      }).join("")}
    </div>
  `;
}

function getCartQuantity(productId) {
  return cart.get(productId) || 0;
}

function renderProducts() {
  const matchingProducts = getMatchingProducts();
  const displayedProducts = matchingProducts.slice(0, visibleLimit);
  const displayCount = Math.min(displayedProducts.length, matchingProducts.length);
  catalogTitle.textContent = activeCategory || "Semua Item";
  const resultDescription = searchTerm
    ? `${matchingProducts.length} produk ditemukan`
    : activeCategory
      ? `${matchingProducts.length} produk dalam kategori ${activeCategory}`
      : `${products.length} produk tersedia`;
  productCount.textContent = matchingProducts.length > displayCount
    ? `Menampilkan ${displayCount} dari ${resultDescription}`
    : resultDescription;

  productGrid.innerHTML = displayedProducts.map((product) => {
    const quantity = getCartQuantity(product.id);
    const unitPrice = getPriceTier(product, Math.max(quantity, 1)).price;
    const imagePath = `images/${encodeURIComponent(product.code)}.webp`;

    return `
      <article class="product-card">
        <div class="product-image-wrap">
          <img
            class="product-image"
            src="${imagePath}"
            alt="${escapeHtml(product.name)}"
            loading="lazy"
          />
          <span class="product-code">${escapeHtml(product.code)}</span>
        </div>
        <div class="product-details">
          <h3 title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</h3>
          <p class="product-price">${formatPrice(unitPrice)}</p>
          ${renderPriceBreakdown(product)}
          <button
            class="add-button ${quantity ? "has-quantity" : ""}"
            type="button"
            data-add-id="${product.id}"
            aria-label="Tambah ${escapeHtml(product.name)} ke keranjang"
          >
            <span aria-hidden="true">+</span>
            ${quantity ? `Tambah lagi - ${quantity} ${escapeHtml(product.unit)}` : "Tambah ke keranjang"}
          </button>
        </div>
      </article>
    `;
  }).join("");
  emptyResults.hidden = matchingProducts.length > 0;

  productGrid.querySelectorAll(".product-image").forEach((image) => {
    image.addEventListener("error", () => {
      image.classList.add("image-unavailable");
      image.removeAttribute("src");
    }, { once: true });
  });

  loadMoreButton.hidden = !products.length || displayedProducts.length >= matchingProducts.length;
}

function renderCart() {
  const cartProducts = products.filter((product) => getCartQuantity(product.id) > 0);
  let total = 0;
  let totalItems = 0;

  cartItems.innerHTML = cartProducts.map((product) => {
    const quantity = getCartQuantity(product.id);
    const unitPrice = getPriceTier(product, quantity).price;
    const lineTotal = unitPrice * quantity;
    total += lineTotal;
    totalItems += quantity;

    return `
      <article class="cart-item">
        <div class="cart-item-info">
          <strong>${escapeHtml(product.name)}</strong>
          <span>${escapeHtml(product.code)} - ${formatPrice(unitPrice)} / ${escapeHtml(product.unit)}</span>
          <span>Jumlah: ${formatQuantity(quantity)} ${escapeHtml(product.unit)}</span>
          <b>${formatPrice(lineTotal)}</b>
        </div>
        <div class="quantity-control" aria-label="Jumlah ${escapeHtml(product.name)}">
          <button type="button" data-cart-change="-1" data-id="${product.id}" aria-label="Kurangi jumlah">-</button>
          <input
            class="quantity-input"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            value="${formatQuantity(quantity)}"
            data-cart-quantity="${product.id}"
            aria-label="Jumlah ${escapeHtml(product.name)} dalam ${escapeHtml(product.unit)}"
          />
          <button type="button" data-cart-change="1" data-id="${product.id}" aria-label="Tambah jumlah">+</button>
        </div>
      </article>
    `;
  }).join("");

  emptyCartMessage.hidden = cartProducts.length > 0;
  document.querySelector("#cartTotal").textContent = formatPrice(total);
  document.querySelector("#cartCount").textContent = formatQuantity(totalItems);
  document.querySelector("#openCartButton").setAttribute(
    "aria-label",
    `Buka keranjang, ${totalItems} produk`,
  );
}

function render() {
  renderCategoryFilters();
  renderProducts();
  renderCart();
}

function changeQuantity(productId, change) {
  const currentQuantity = getCartQuantity(productId);
  const nextQuantity = Math.max(0, currentQuantity + change);
  if (nextQuantity === 0) cart.delete(productId);
  else cart.set(productId, nextQuantity);
  render();
}

cartItems.addEventListener("focusin", (event) => {
  if (event.target.matches("[data-cart-quantity]")) event.target.select();
});

cartItems.addEventListener("change", (event) => {
  if (!event.target.matches("[data-cart-quantity]")) return;
  const productId = Number(event.target.dataset.cartQuantity);
  const quantity = parseQuantity(event.target.value);
  if (Number.isNaN(quantity)) {
    renderCart();
    return;
  }
  if (quantity === 0) cart.delete(productId);
  else cart.set(productId, quantity);
  render();
});

cartItems.addEventListener("keydown", (event) => {
  if (event.target.matches("[data-cart-quantity]") && event.key === "Enter") {
    event.preventDefault();
    event.target.blur();
  }
});

function applySearch() {
  const nextSearchTerm = searchInput.value.trim().toLocaleLowerCase("id-ID");
  if (nextSearchTerm === searchTerm) return;
  searchTerm = nextSearchTerm;
  visibleLimit = PAGE_SIZE;
  renderProducts();
}

searchInput.addEventListener("input", () => {
  document.querySelector("#clearSearchButton").hidden = !searchInput.value.trim();
});

searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    applySearch();
    searchInput.blur();
  }
});

document.querySelector("#clearSearchButton").addEventListener("click", () => {
  searchInput.value = "";
  document.querySelector("#clearSearchButton").hidden = true;
  applySearch();
  searchInput.focus();
});

loadMoreButton.addEventListener("click", () => {
  visibleLimit += PAGE_SIZE;
  renderProducts();
});

categoryFilters.addEventListener("click", (event) => {
  const allItemsButton = event.target.closest("[data-category-all]");
  const categoryButton = event.target.closest("[data-category]");
  if (!allItemsButton && !categoryButton) return;

  activeCategory = allItemsButton ? null : categoryButton.dataset.category;
  visibleLimit = PAGE_SIZE;
  renderCategoryFilters();
  renderProducts();
});

productGrid.addEventListener("click", (event) => {
  const addButton = event.target.closest("[data-add-id]");
  if (addButton) changeQuantity(Number(addButton.dataset.addId), 1);
});

cartItems.addEventListener("click", (event) => {
  const changeButton = event.target.closest("[data-cart-change]");
  if (changeButton) {
    changeQuantity(Number(changeButton.dataset.id), Number(changeButton.dataset.cartChange));
  }
});

document.querySelector("#openCartButton").addEventListener("click", () => cartDialog.showModal());
document.querySelector("#closeCartButton").addEventListener("click", () => cartDialog.close());
cartDialog.addEventListener("click", (event) => {
  if (event.target === cartDialog) cartDialog.close();
});

async function loadProductFile() {
  try {
    const response = await fetch(PRODUCT_FILE, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(
        response.status === 404
          ? `File ${PRODUCT_FILE} tidak ditemukan. Letakkan file tersebut di folder yang sama dengan index.html.`
          : `Gagal membaca ${PRODUCT_FILE} (HTTP ${response.status}).`,
      );
    }

    const result = readProducts(await response.text());
    products = result.products;
    searchInput.disabled = false;

    if (products.length === 0) {
      statusMessage.textContent = "Belum ada produk valid di DATA BARANG.csv.";
      statusMessage.hidden = false;
    } else if (result.skippedRows > 0) {
      statusMessage.textContent = `${result.skippedRows} baris CSV dilewati karena kode, nama, satuan, atau harga tidak valid.`;
      statusMessage.hidden = false;
      statusMessage.classList.add("status-warning");
    } else {
      statusMessage.hidden = true;
    }

    render();
  } catch (error) {
    statusMessage.textContent = error instanceof TypeError
      ? "Browser tidak dapat membaca CSV dari file langsung. Jalankan aplikasi melalui server lokal, misalnya Live Server di VS Code."
      : error.message;
    statusMessage.hidden = false;
    statusMessage.classList.add("status-error");
    productCount.textContent = "Data produk belum dimuat";
    loadMoreButton.hidden = true;
  }
}

loadProductFile();
