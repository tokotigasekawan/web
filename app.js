const PAGE_SIZE = 30;
const BRANCHES = [
  {
    id: "sukanagalih",
    name: "Sukanagalih",
    storeTitle: "Toko Tiga Sekawan Sukanagalih",
    productFile: "SUKANAGALIH DATA BARANG.csv",
  },
  {
    id: "simpang1",
    name: "Simpang 1",
    storeTitle: "Toko Tiga Sekawan Simpang 1",
    productFile: "DATA BARANG.csv",
  },
];

let products = [];
let cart = new Map();
const branchCarts = new Map();
let addQuantities = new Map();
const branchAddQuantities = new Map();
let visibleLimit = PAGE_SIZE;
let searchTerm = "";
let activeCategory = null;
let activeBranchId = "simpang1";
let branchLoadRequest = 0;

const productGrid = document.querySelector("#productGrid");
const categoryFilters = document.querySelector("#categoryFilters");
const searchInput = document.querySelector("#searchInput");
const statusMessage = document.querySelector("#statusMessage");
const dataUpdatedAt = document.querySelector("#dataUpdatedAt");
const brandTitle = document.querySelector("#brandTitle");
const branchDialog = document.querySelector("#branchDialog");
const profileDialog = document.querySelector("#profileDialog");
const productCount = document.querySelector("#productCount");
const catalogTitle = document.querySelector("#catalogTitle");
const emptyResults = document.querySelector("#emptyResults");
const loadMoreButton = document.querySelector("#loadMoreButton");
const cartDialog = document.querySelector("#cartDialog");
const cartItems = document.querySelector("#cartItems");
const emptyCartMessage = document.querySelector("#emptyCartMessage");
const clearCartButton = document.querySelector("#clearCartButton");
const categorySuggestionDialog = document.querySelector("#categorySuggestionDialog");
const whatsappOrderButton = document.querySelector("#whatsappOrderButton");
const backToTopButton = document.querySelector("#backToTopButton");
const cartButton = document.querySelector("#openCartButton");
const welcomeGreeting = document.querySelector("#welcomeGreeting");
const authGate = document.querySelector("#authGate");
const appShell = document.querySelector("#appShell");
const phoneForm = document.querySelector("#phoneForm");
const phoneInput = document.querySelector("#phoneInput");
const registrationForm = document.querySelector("#registrationForm");
const customerNameInput = document.querySelector("#customerNameInput");
const getLocationButton = document.querySelector("#getLocationButton");
const registerButton = document.querySelector("#registerButton");
const locationStatus = document.querySelector("#locationStatus");
const refreshLocationButton = document.querySelector("#refreshLocationButton");
const accountLocationStatus = document.querySelector("#accountLocationStatus");
const otpPanel = document.querySelector("#otpPanel");
const otpInput = document.querySelector("#otpInput");
const otpDemoCode = document.querySelector("#otpDemoCode");
const authMessage = document.querySelector("#authMessage");
const authSessionKey = "tts-demo-auth-profile";
const customerProfilesKey = "tts-demo-customer-profiles";
let pendingCustomer = null;
let pendingOtp = "";
let registrationLocation = null;
let activeCustomer = null;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function normalizePhone(phone) {
  const trimmedPhone = phone.trim();
  const normalizedPhone = trimmedPhone.replace(/[\s()+-]/g, "");
  const digitsOnly = normalizedPhone.replace(/\D/g, "");
  if (!/^\+?\d+$/.test(normalizedPhone) || digitsOnly.length < 10 || digitsOnly.length > 15) {
    return null;
  }
  return { phone: trimmedPhone, phoneKey: digitsOnly };
}

function readCustomerProfiles() {
  const storedProfiles = localStorage.getItem(customerProfilesKey);
  if (!storedProfiles) return {};

  let profiles;
  try {
    profiles = JSON.parse(storedProfiles);
  } catch {
    throw new Error("Data profil simulasi tidak bisa dibaca. Hapus data situs lalu daftar kembali.");
  }
  if (!profiles || typeof profiles !== "object" || Array.isArray(profiles)) {
    throw new Error("Format profil simulasi tidak valid. Hapus data situs lalu daftar kembali.");
  }
  return profiles;
}

function getCustomerProfile(phoneKey) {
  const profiles = readCustomerProfiles();
  const profile = profiles[phoneKey];
  if (
    !profile
    || profile.phoneKey !== phoneKey
    || typeof profile.name !== "string"
    || typeof profile.phone !== "string"
    || !profile.location
    || !Number.isFinite(profile.location.latitude)
    || !Number.isFinite(profile.location.longitude)
  ) {
    return null;
  }
  return profile;
}

function saveCustomerProfile(customer) {
  const profiles = readCustomerProfiles();
  profiles[customer.phoneKey] = customer;
  localStorage.setItem(customerProfilesKey, JSON.stringify(profiles));
}

function getCustomerCartKey(phoneKey, branchId) {
  return `tts-demo-cart-v2-${phoneKey}-${branchId}`;
}

function getProductCartIdentity(product) {
  return JSON.stringify([product.code, product.name, product.unit]);
}

function saveCurrentCart() {
  if (!activeCustomer || products.length === 0) return;

  const cartEntries = [];
  for (const product of products) {
    const quantity = getCartQuantity(product.id);
    if (quantity > 0) {
      cartEntries.push({
        identity: getProductCartIdentity(product),
        quantity,
      });
    }
  }

  try {
    localStorage.setItem(
      getCustomerCartKey(activeCustomer.phoneKey, activeBranchId),
      JSON.stringify(cartEntries),
    );
  } catch (error) {
    console.error("Keranjang tidak dapat disimpan di browser.", error);
    statusMessage.textContent = "Keranjang tidak dapat disimpan di browser ini. Periksa ruang penyimpanan atau pengaturan browser.";
    statusMessage.hidden = false;
    statusMessage.classList.add("status-error");
  }
}

function loadSavedCart(branchProducts, branch) {
  if (!activeCustomer) return new Map();
  const savedCart = localStorage.getItem(getCustomerCartKey(activeCustomer.phoneKey, branch.id));
  if (!savedCart) return new Map();

  let cartEntries;
  try {
    cartEntries = JSON.parse(savedCart);
  } catch {
    throw new Error("Data keranjang tersimpan tidak bisa dibaca. Hapus data keranjang browser lalu coba lagi.");
  }
  if (!Array.isArray(cartEntries)) {
    throw new Error("Format keranjang tersimpan tidak valid. Hapus data keranjang browser lalu coba lagi.");
  }

  const savedByIdentity = new Map();
  for (const entry of cartEntries) {
    if (
      !entry
      || typeof entry.identity !== "string"
      || !Number.isFinite(entry.quantity)
      || entry.quantity <= 0
    ) {
      throw new Error("Isi keranjang tersimpan tidak valid. Hapus data keranjang browser lalu coba lagi.");
    }
    const entries = savedByIdentity.get(entry.identity) || [];
    entries.push(entry.quantity);
    savedByIdentity.set(entry.identity, entries);
  }

  const restoredCart = new Map();
  for (const product of branchProducts) {
    const entries = savedByIdentity.get(getProductCartIdentity(product));
    const quantity = entries?.shift();
    if (Number.isFinite(quantity)) {
      restoredCart.set(product.id, quantity);
    }
  }
  return restoredCart;
}

function renderCustomerProfile() {
  if (!activeCustomer) return;
  document.querySelector("#profileName").textContent = activeCustomer.name;
  document.querySelector("#profilePhone").textContent = activeCustomer.phone;
  const { latitude, longitude } = activeCustomer.location;
  const mapsUrl = `https://maps.google.com/?q=${latitude},${longitude}`;
  const locationLink = document.querySelector("#profileLocationLink");
  locationLink.href = mapsUrl;
  locationLink.textContent = "Lihat lokasi di Google Maps";
  document.querySelector("#profileCoordinates").textContent = `${latitude}, ${longitude}`;
}

refreshLocationButton.addEventListener("click", () => {
  if (!window.isSecureContext || !navigator.geolocation) {
    accountLocationStatus.textContent = "Pembaruan GPS memerlukan situs HTTPS dan dukungan lokasi di perangkat.";
    accountLocationStatus.classList.add("is-error");
    return;
  }

  refreshLocationButton.disabled = true;
  accountLocationStatus.textContent = "Meminta izin lokasi terbaru...";
  accountLocationStatus.classList.remove("is-error");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      try {
        const updatedCustomer = {
          ...activeCustomer,
          location: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          },
        };
        saveCustomerProfile(updatedCustomer);
        activeCustomer = updatedCustomer;
        renderCustomerProfile();
        accountLocationStatus.textContent = `Lokasi berhasil diperbarui (akurasi sekitar ${Math.round(position.coords.accuracy)} meter).`;
      } catch (error) {
        accountLocationStatus.textContent = `Lokasi tidak tersimpan: ${error.message}`;
        accountLocationStatus.classList.add("is-error");
      } finally {
        refreshLocationButton.disabled = false;
      }
    },
    (error) => {
      accountLocationStatus.textContent = error.code === error.PERMISSION_DENIED
        ? "Izin lokasi ditolak. Lokasi lama tetap tersimpan."
        : error.code === error.POSITION_UNAVAILABLE
          ? "Lokasi terbaru tidak tersedia. Lokasi lama tetap tersimpan."
          : "Permintaan lokasi terlalu lama. Lokasi lama tetap tersimpan.";
      accountLocationStatus.classList.add("is-error");
      refreshLocationButton.disabled = false;
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
  );
});

function startCatalogSession(customer) {
  activeCustomer = customer;
  localStorage.setItem(authSessionKey, customer.phoneKey);
  renderCustomerProfile();
  welcomeGreeting.textContent = `Halo ${customer.name},`;
  accountLocationStatus.textContent = "";
  accountLocationStatus.classList.remove("is-error");
  authGate.hidden = true;
  appShell.hidden = false;
  loadProductFile(BRANCHES.find((branch) => branch.id === activeBranchId));
}

function resetLoginForm() {
  pendingCustomer = null;
  pendingOtp = "";
  phoneForm.hidden = false;
  registrationForm.hidden = true;
  otpPanel.hidden = true;
  registrationLocation = null;
  registerButton.disabled = true;
  customerNameInput.value = "";
  locationStatus.textContent = "Lokasi GPS wajib untuk pendaftaran.";
  locationStatus.classList.remove("is-error");
  otpInput.value = "";
  authMessage.textContent = "";
  document.querySelector("#authTitle").textContent = "Masuk ke Toko Tiga Sekawan";
}

phoneForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const phone = normalizePhone(phoneInput.value);
  if (!phone) {
    authMessage.textContent = "Periksa nomor HP. Masukkan 10 sampai 15 digit angka.";
    return;
  }

  try {
    const existingCustomer = getCustomerProfile(phone.phoneKey);
    authMessage.textContent = "";
    if (existingCustomer) {
      requestDemoOtp(existingCustomer);
      return;
    }

    pendingCustomer = phone;
    phoneForm.hidden = true;
    registrationForm.hidden = false;
    document.querySelector("#authTitle").textContent = "Daftar pelanggan";
    locationStatus.textContent = "Lokasi GPS wajib untuk pendaftaran.";
    customerNameInput.focus();
  } catch (error) {
    authMessage.textContent = error.message;
  }
});

function requestDemoOtp(customer) {
  pendingCustomer = customer;
  pendingOtp = String(Math.floor(100000 + Math.random() * 900000));
  otpDemoCode.textContent = pendingOtp;
  document.querySelector("#otpPhoneDescription").textContent = `Kode simulasi untuk ${customer.phone}`;
  phoneForm.hidden = true;
  registrationForm.hidden = true;
  otpPanel.hidden = false;
  authMessage.textContent = "";
  otpInput.value = "";
  otpInput.focus();
}

getLocationButton.addEventListener("click", () => {
  if (!window.isSecureContext || !navigator.geolocation) {
    locationStatus.textContent = "GPS memerlukan HTTPS. Untuk tes lewat jaringan Wi-Fi, buka situs melalui alamat HTTPS.";
    locationStatus.classList.add("is-error");
    return;
  }

  getLocationButton.disabled = true;
  registerButton.disabled = true;
  locationStatus.textContent = "Meminta izin lokasi dari perangkat...";
  locationStatus.classList.remove("is-error");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      registrationLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      };
      locationStatus.textContent = `Lokasi berhasil diambil (akurasi sekitar ${Math.round(position.coords.accuracy)} meter).`;
      getLocationButton.disabled = false;
      registerButton.disabled = false;
    },
    (error) => {
      registrationLocation = null;
      registerButton.disabled = true;
      getLocationButton.disabled = false;
      locationStatus.textContent = error.code === error.PERMISSION_DENIED
        ? "Izin lokasi ditolak. Izinkan akses lokasi di pengaturan browser untuk melanjutkan."
        : error.code === error.POSITION_UNAVAILABLE
          ? "Lokasi perangkat tidak tersedia. Periksa GPS dan coba lagi."
          : "Permintaan lokasi terlalu lama. Coba ambil lokasi sekali lagi.";
      locationStatus.classList.add("is-error");
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
  );
});

registrationForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = customerNameInput.value.trim();
  if (!name) {
    authMessage.textContent = "Nama pelanggan wajib diisi.";
    customerNameInput.focus();
    return;
  }
  if (!registrationLocation || !pendingCustomer) {
    authMessage.textContent = "Ambil lokasi GPS terlebih dahulu untuk melanjutkan pendaftaran.";
    return;
  }

  requestDemoOtp({
    ...pendingCustomer,
    name,
    location: registrationLocation,
  });
});

document.querySelector("#otpForm").addEventListener("submit", (event) => {
  event.preventDefault();
  if (otpInput.value !== pendingOtp || !pendingCustomer) {
    authMessage.textContent = "Kode OTP belum cocok. Periksa kode simulasi di atas dan coba lagi.";
    otpInput.select();
    return;
  }

  try {
    if (pendingCustomer.name && pendingCustomer.location) {
      saveCustomerProfile(pendingCustomer);
    }
    startCatalogSession(getCustomerProfile(pendingCustomer.phoneKey));
  } catch (error) {
    authMessage.textContent = error.message;
  }
});

document.querySelector("#changePhoneButton").addEventListener("click", () => {
  resetLoginForm();
  phoneInput.focus();
});

document.querySelector("#logoutButton").addEventListener("click", () => {
  branchDialog.close();
  localStorage.removeItem(authSessionKey);
  activeCustomer = null;
  products = [];
  cart = new Map();
  branchCarts.clear();
  addQuantities = new Map();
  branchAddQuantities.clear();
  appShell.hidden = true;
  authGate.hidden = false;
  resetLoginForm();
  phoneInput.focus();
});

try {
  const existingDemoSession = localStorage.getItem(authSessionKey);
  const existingCustomer = existingDemoSession
    ? getCustomerProfile(existingDemoSession)
    : null;
  if (existingCustomer) {
    startCatalogSession(existingCustomer);
  } else {
    localStorage.removeItem(authSessionKey);
    authGate.hidden = false;
    appShell.hidden = true;
  }
} catch (error) {
  authMessage.textContent = error.message;
  authGate.hidden = false;
  appShell.hidden = true;
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

function formatDataUpdate(dateValue, timeValue) {
  const dateMatch = dateValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const timeMatch = timeValue.trim().match(/^(\d{1,2})[.:](\d{2})$/);
  if (!dateMatch || !timeMatch) return "";

  const [, dayText, monthText, yearText] = dateMatch;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  const hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
    || hours > 23
    || minutes > 59
  ) {
    return "";
  }

  const formattedDate = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
  return `${formattedDate}, pukul ${String(hours).padStart(2, "0")}.${String(minutes).padStart(2, "0")}`;
}

function readProducts(csvText, productFile) {
  const rows = parseCsv(csvText.replace(/^\uFEFF/, ""));
  if (rows.length < 2) throw new Error(`File ${productFile} belum memiliki data produk.`);

  let updatedDate = "";
  let updatedTime = "";
  for (let index = 0; index < rows[0].length; index += 1) {
    const header = normalizeHeader(rows[0][index]);
    if (header === "tanggalupdate") updatedDate = rows[0][index + 1] || "";
    if (header === "jam") updatedTime = rows[0][index + 1] || "";
  }
  const lastUpdated = formatDataUpdate(updatedDate, updatedTime);

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

  return { products: parsedProducts, skippedRows, lastUpdated };
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

function getSearchMatchesAcrossCategories() {
  return products.filter((product) => (
    !searchTerm
    || product.code.toLocaleLowerCase("id-ID").includes(searchTerm)
    || product.name.toLocaleLowerCase("id-ID").includes(searchTerm)
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
    const addQuantity = addQuantities.get(product.id) ?? 1;
    const hasAddQuantity = addQuantities.has(product.id);
    const unitPrice = getPriceTier(product, Math.max(addQuantity, 1)).price;
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
            class="add-button"
            type="button"
            data-add-id="${product.id}"
            ${hasAddQuantity && addQuantity <= 0 ? "disabled" : ""}
            aria-label="${hasAddQuantity
              ? `Tambahkan ${formatQuantity(addQuantity)} ${escapeHtml(product.unit)} ${escapeHtml(product.name)} ke keranjang`
              : `Tambah ${escapeHtml(product.name)} ke keranjang`}"
          >
            <span aria-hidden="true">+</span>
            ${hasAddQuantity
              ? `Tambahkan ${formatQuantity(addQuantity)} ${escapeHtml(product.unit)} ke keranjang`
              : "Tambah ke keranjang"}
          </button>
          ${hasAddQuantity
            ? `
              <div class="quantity-control product-quantity-control" aria-label="Jumlah ${escapeHtml(product.name)}">
                <button type="button" data-add-quantity-change="-1" data-id="${product.id}" aria-label="Kurangi jumlah tambahan ${escapeHtml(product.name)}">-</button>
                <input
                  class="quantity-input"
                  type="text"
                  inputmode="decimal"
                  autocomplete="off"
                  value="${formatQuantity(addQuantity)}"
                  data-add-quantity="${product.id}"
                  aria-label="Jumlah yang ditambahkan untuk ${escapeHtml(product.name)} dalam ${escapeHtml(product.unit)}"
                />
                <button type="button" data-add-quantity-change="1" data-id="${product.id}" aria-label="Tambah jumlah tambahan ${escapeHtml(product.name)}">+</button>
              </div>
            `
            : ""}
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

  cartItems.innerHTML = cartProducts.map((product) => {
    const quantity = getCartQuantity(product.id);
    const unitPrice = getPriceTier(product, quantity).price;
    const lineTotal = unitPrice * quantity;
    total += lineTotal;

    return `
      <article class="cart-item">
        <div class="cart-item-info">
          <strong>${escapeHtml(product.name)}</strong>
          <span>${escapeHtml(product.code)} - ${formatPrice(unitPrice)} / ${escapeHtml(product.unit)}</span>
          <span>Jumlah: ${formatQuantity(quantity)} ${escapeHtml(product.unit)}</span>
          <b>${formatPrice(lineTotal)}</b>
        </div>
        <div class="cart-item-actions">
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
          <button
            class="remove-cart-item-button"
            type="button"
            data-cart-remove="${product.id}"
            aria-label="Hapus ${escapeHtml(product.name)} dari keranjang"
          >×</button>
        </div>
      </article>
    `;
  }).join("");

  emptyCartMessage.hidden = cartProducts.length > 0;
  clearCartButton.disabled = cartProducts.length === 0;
  document.querySelector("#cartTotal").textContent = formatPrice(total);
  document.querySelector("#cartCount").textContent = String(cartProducts.length);
  document.querySelector("#openCartButton").setAttribute(
    "aria-label",
    `Buka keranjang, ${cartProducts.length} jenis barang`,
  );
  saveCurrentCart();

  const activeBranch = BRANCHES.find((branch) => branch.id === activeBranchId);
  const orderLines = cartProducts.map((product, index) => {
    const quantity = getCartQuantity(product.id);
    const unitPrice = getPriceTier(product, quantity).price;
    const lineTotal = unitPrice * quantity;
    return [
      `${index + 1}. ${product.name}`,
      `* = ${formatQuantity(quantity)} ${product.unit} x ${formatAmount(unitPrice)} = *${formatAmount(lineTotal)}*`,
    ].join("\n");
  });
  const orderMessage = [
    `HALO TOKO TIGA SEKAWAN ${activeBranch.name.toLocaleUpperCase("id-ID")} saya pesan dengan rincian di bawah ini :`,
    `Nama: ${activeCustomer.name}`,
    `Lokasi: https://maps.google.com/?q=${activeCustomer.location.latitude},${activeCustomer.location.longitude}`,
    "",
    orderLines.join("\n\n"),
    "",
    `TOTAL: *${formatPrice(total)}*`,
    "",
    "terimakasih",
  ].join("\n");
  whatsappOrderButton.href = cartProducts.length
    ? `https://wa.me/6285559156569?text=${encodeURIComponent(orderMessage)}`
    : "#";
  whatsappOrderButton.setAttribute("aria-disabled", String(cartProducts.length === 0));
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

function bindQuantityInputEvents(container) {
  container.addEventListener("focusin", (event) => {
    if (event.target.matches("[data-cart-quantity]")) event.target.select();
  });

  container.addEventListener("change", (event) => {
    if (!event.target.matches("[data-cart-quantity]")) return;
    const productId = Number(event.target.dataset.cartQuantity);
    const quantity = parseQuantity(event.target.value);
    if (Number.isNaN(quantity)) {
      render();
      return;
    }
    if (quantity === 0) cart.delete(productId);
    else cart.set(productId, quantity);
    render();
  });

  container.addEventListener("keydown", (event) => {
    if (event.target.matches("[data-cart-quantity]") && event.key === "Enter") {
      event.preventDefault();
      event.target.blur();
    }
  });
}

bindQuantityInputEvents(cartItems);

function animateProductToCart(productCard) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const sourceImage = productCard.querySelector(".product-image");
  const sourceRect = sourceImage?.naturalWidth
    ? sourceImage.getBoundingClientRect()
    : productCard.querySelector(".add-button").getBoundingClientRect();
  const targetRect = cartButton.getBoundingClientRect();
  const size = 54;
  const startX = sourceRect.left + (sourceRect.width - size) / 2;
  const startY = sourceRect.top + (sourceRect.height - size) / 2;
  const endX = targetRect.left + (targetRect.width - size) / 2;
  const endY = targetRect.top + (targetRect.height - size) / 2;
  const flyer = sourceImage?.naturalWidth
    ? document.createElement("img")
    : document.createElement("span");

  if (flyer instanceof HTMLImageElement) {
    flyer.src = sourceImage.currentSrc || sourceImage.src;
    flyer.alt = "";
  } else {
    flyer.textContent = "+";
  }
  flyer.classList.add("cart-flight-item");
  Object.assign(flyer.style, {
    left: `${startX}px`,
    top: `${startY}px`,
    width: `${size}px`,
    height: `${size}px`,
  });
  document.body.append(flyer);

  if (typeof flyer.animate !== "function") {
    flyer.remove();
    return;
  }

  const animation = flyer.animate([
    { transform: "translate(0, 0) scale(1) rotate(0deg)", opacity: 1 },
    { transform: `translate(${(endX - startX) * 0.55}px, ${(endY - startY) * 0.55}px) scale(0.75) rotate(10deg)`, opacity: 1, offset: 0.65 },
    { transform: `translate(${endX - startX}px, ${endY - startY}px) scale(0.25) rotate(18deg)`, opacity: 0.15 },
  ], {
    duration: 560,
    easing: "cubic-bezier(0.22, 0.75, 0.3, 1)",
    fill: "forwards",
  });

  animation.addEventListener("finish", () => {
    flyer.remove();
    cartButton.classList.remove("cart-button--bump");
    void cartButton.offsetWidth;
    cartButton.classList.add("cart-button--bump");
  }, { once: true });
  cartButton.addEventListener("animationend", (event) => {
    if (event.animationName === "cart-button-bump") {
      cartButton.classList.remove("cart-button--bump");
    }
  }, { once: true });
}

productGrid.addEventListener("focusin", (event) => {
  if (event.target.matches("[data-add-quantity]")) event.target.select();
});

productGrid.addEventListener("change", (event) => {
  if (!event.target.matches("[data-add-quantity]")) return;
  const productId = Number(event.target.dataset.addQuantity);
  const quantity = parseQuantity(event.target.value);
  if (Number.isNaN(quantity)) {
    renderProducts();
    return;
  }
  addQuantities.set(productId, quantity);
  renderProducts();
});

productGrid.addEventListener("keydown", (event) => {
  if (event.target.matches("[data-add-quantity]") && event.key === "Enter") {
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
    showCategorySuggestionIfRelevant();
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
  showCategorySuggestionIfRelevant();
});

productGrid.addEventListener("click", (event) => {
  const addButton = event.target.closest("[data-add-id]");
  if (addButton) {
    const productId = Number(addButton.dataset.addId);
    const addQuantity = addQuantities.get(productId) ?? 1;
    if (addQuantity <= 0) return;
    animateProductToCart(addButton.closest(".product-card"));
    cart.set(productId, getCartQuantity(productId) + addQuantity);
    addQuantities.set(productId, 1);
    render();
    return;
  }

  const addQuantityButton = event.target.closest("[data-add-quantity-change]");
  if (addQuantityButton) {
    const productId = Number(addQuantityButton.dataset.id);
    const currentQuantity = addQuantities.get(productId) ?? 1;
    addQuantities.set(
      productId,
      Math.max(0, currentQuantity + Number(addQuantityButton.dataset.addQuantityChange)),
    );
    renderProducts();
  }
});

cartItems.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-cart-remove]");
  if (removeButton) {
    cart.delete(Number(removeButton.dataset.cartRemove));
    render();
    return;
  }

  const changeButton = event.target.closest("[data-cart-change]");
  if (changeButton) {
    changeQuantity(Number(changeButton.dataset.id), Number(changeButton.dataset.cartChange));
  }
});

document.querySelector("#openCartButton").addEventListener("click", () => cartDialog.showModal());
document.querySelector("#closeCartButton").addEventListener("click", () => cartDialog.close());
clearCartButton.addEventListener("click", () => {
  if (cart.size === 0) return;
  if (!window.confirm("Kosongkan semua barang di keranjang cabang ini?")) return;
  cart.clear();
  render();
});
cartDialog.addEventListener("click", (event) => {
  if (event.target === cartDialog) cartDialog.close();
});
whatsappOrderButton.addEventListener("click", (event) => {
  if (whatsappOrderButton.getAttribute("aria-disabled") === "true") event.preventDefault();
});

function showCategorySuggestionIfRelevant() {
  if (
    activeCategory !== null
    && searchTerm
    && getMatchingProducts().length === 0
    && getSearchMatchesAcrossCategories().length > 0
    && !categorySuggestionDialog.open
  ) {
    categorySuggestionDialog.showModal();
  }
}

document.querySelector("#closeCategorySuggestionButton").addEventListener("click", () => {
  categorySuggestionDialog.close();
});
document.querySelector("#dismissCategorySuggestionButton").addEventListener("click", () => {
  categorySuggestionDialog.close();
});
categorySuggestionDialog.addEventListener("click", (event) => {
  if (event.target === categorySuggestionDialog) categorySuggestionDialog.close();
});
document.querySelector("#showAllItemsButton").addEventListener("click", () => {
  activeCategory = null;
  visibleLimit = PAGE_SIZE;
  render();
  categorySuggestionDialog.close();
});

function updateBranchSelection() {
  const activeBranch = BRANCHES.find((branch) => branch.id === activeBranchId);
  document.documentElement.dataset.branch = activeBranchId;
  document.querySelector('meta[name="theme-color"]').content = getComputedStyle(document.documentElement)
    .getPropertyValue("--blue")
    .trim();
  brandTitle.textContent = activeBranch.storeTitle;
  document.querySelector(".brand").setAttribute("aria-label", `${activeBranch.storeTitle}, beranda`);
  document.querySelectorAll("[data-branch-id]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.branchId === activeBranchId));
  });
}

async function loadProductFile(branch) {
  if (branch.id !== activeBranchId) {
    saveCurrentCart();
  }
  const requestId = branchLoadRequest + 1;
  branchLoadRequest = requestId;
  statusMessage.textContent = `Memuat data barang cabang ${branch.name}...`;
  statusMessage.hidden = false;
  statusMessage.classList.remove("status-error");

  try {
    const response = await fetch(branch.productFile, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(
        response.status === 404
          ? `File ${branch.productFile} tidak ditemukan. Letakkan file tersebut di folder yang sama dengan index.html.`
          : `Gagal membaca ${branch.productFile} (HTTP ${response.status}).`,
      );
    }

    const csvText = await response.text();
    if (requestId !== branchLoadRequest) return;
    const result = readProducts(csvText, branch.productFile);
    if (branch.id !== activeBranchId) {
      branchCarts.set(activeBranchId, cart);
      branchAddQuantities.set(activeBranchId, addQuantities);
      addQuantities = branchAddQuantities.get(branch.id) || new Map();
      activeBranchId = branch.id;
    }
    products = result.products;
    cart = loadSavedCart(products, branch);
    branchCarts.set(branch.id, cart);
    dataUpdatedAt.textContent = result.lastUpdated
      ? `Data diperbarui terakhir ${result.lastUpdated}`
      : "";
    dataUpdatedAt.hidden = !result.lastUpdated;
    visibleLimit = PAGE_SIZE;
    searchTerm = "";
    activeCategory = null;
    searchInput.value = "";
    document.querySelector("#clearSearchButton").hidden = true;
    searchInput.disabled = false;
    updateBranchSelection();

    if (products.length === 0) {
      statusMessage.textContent = `Belum ada produk valid di ${branch.productFile}.`;
      statusMessage.hidden = false;
    } else {
      statusMessage.hidden = true;
    }
    if (result.skippedRows > 0) {
      console.warn(`${result.skippedRows} baris CSV dilewati di ${branch.productFile} karena data produk tidak lengkap atau harga tidak valid.`);
    }

    render();
  } catch (error) {
    if (requestId !== branchLoadRequest) return;
    statusMessage.textContent = error instanceof TypeError
      ? "Browser tidak dapat membaca CSV dari file langsung. Jalankan aplikasi melalui server lokal, misalnya Live Server di VS Code."
      : error.message;
    statusMessage.hidden = false;
    statusMessage.classList.add("status-error");
    if (products.length === 0) {
      searchInput.disabled = true;
      productCount.textContent = "Data produk belum dimuat";
      loadMoreButton.hidden = true;
    }
  }
}

document.querySelector("#openBranchMenuButton").addEventListener("click", () => branchDialog.showModal());
document.querySelector("#closeBranchMenuButton").addEventListener("click", () => branchDialog.close());
document.querySelector("#openProfileButton").addEventListener("click", () => {
  branchDialog.close();
  renderCustomerProfile();
  profileDialog.showModal();
});
document.querySelector("#closeProfileButton").addEventListener("click", () => profileDialog.close());
branchDialog.addEventListener("click", (event) => {
  if (event.target === branchDialog) branchDialog.close();
});
branchDialog.addEventListener("click", (event) => {
  if (event.target.closest("#openProfileButton") || event.target.closest("#logoutButton")) return;
  const branchButton = event.target.closest("[data-branch-id]");
  if (!branchButton || branchButton.dataset.branchId === activeBranchId) {
    if (branchButton) branchDialog.close();
    return;
  }

  const branch = BRANCHES.find((item) => item.id === branchButton.dataset.branchId);
  if (!branch) return;
  branchDialog.close();
  loadProductFile(branch);
});

document.querySelector("#backToTopButton").addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});
window.addEventListener("scroll", () => {
  backToTopButton.hidden = window.scrollY < 500;
}, { passive: true });

if ("serviceWorker" in navigator) {
  let isReloadingForServiceWorker = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (isReloadingForServiceWorker) return;
    isReloadingForServiceWorker = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js", {
      scope: "./",
      updateViaCache: "none",
    })
      .then((registration) => registration.update())
      .catch((error) => console.error("Gagal memperbarui service worker PWA.", error));
  });
}
