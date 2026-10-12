"use strict";

/* =========================================
   PA600 VAULT
   Local storage, custom target, deposit ledger
========================================= */

const STORAGE_KEY = "pa600_vault_v2";
const LEGACY_KEY = "pa600_vault_local_only_v3";

const $ = (id) => document.getElementById(id);

const rupiah = (value) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(value);

const todayISO = () => {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0")
  ].join("-");
};

function parseDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function dateLabel(value) {
  return parseDate(value).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function validAmount(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function makeId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function defaultData() {
  return {
    version: 2,
    target: 5000000,
    weekly: 100000,
    history: []
  };
}

function validEntry(entry) {
  return entry &&
    typeof entry.id === "string" &&
    validAmount(Number(entry.amount)) &&
    typeof entry.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(entry.date) &&
    typeof entry.note === "string";
}

function normalizeData(raw) {
  const defaults = defaultData();
  const target = Number(raw?.target);
  const weekly = Number(raw?.weekly);

  const history = Array.isArray(raw?.history)
    ? raw.history.filter(validEntry).map((entry) => ({
        id: entry.id,
        amount: Number(entry.amount),
        date: entry.date,
        note: entry.note
      }))
    : [];

  return {
    version: 2,
    target: validAmount(target) ? target : defaults.target,
    weekly: validAmount(weekly) ? weekly : defaults.weekly,
    history
  };
}

function loadData() {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);

    // Migrasi otomatis jika browser masih memiliki data versi lama.
    if (!raw) {
      raw = localStorage.getItem(LEGACY_KEY);

      if (raw) {
        const oldData = JSON.parse(raw);
        const migrated = normalizeData(oldData);

        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }
    }

    return raw ? normalizeData(JSON.parse(raw)) : defaultData();
  } catch (error) {
    console.error("Gagal membaca data:", error);
    return defaultData();
  }
}

let data = loadData();
let toastTimer = null;
let selectedDate = todayISO();

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error("Gagal menyimpan data:", error);
    showToast("Gagal menyimpan. Periksa penyimpanan browser.");
    return false;
  }
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2800);
}

/* =========================================
   SINGLE SOURCE OF TRUTH
========================================= */

function getBalance() {
  return data.history.reduce(
    (total, entry) => total + entry.amount,
    0
  );
}

function getRemaining() {
  return Math.max(0, data.target - getBalance());
}

function getProgress() {
  if (data.target <= 0) return 0;
  return Math.min(100, (getBalance() / data.target) * 100);
}

/* =========================================
   SUMMARY AND PROGRESS
========================================= */

function renderSummary() {
  const balance = getBalance();
  const remaining = getRemaining();
  const progress = getProgress();

  $("balance").textContent = rupiah(balance);
  $("remainingAmount").textContent = rupiah(remaining);
  $("targetLabel").textContent = rupiah(data.target);
  $("targetSmallLabel").textContent = `Target ${rupiah(data.target)}`;
  $("depositCount").textContent = String(data.history.length);

  $("progressText").textContent =
    `${progress.toLocaleString("id-ID", {
      maximumFractionDigits: 1
    })}%`;

  $("progressBar").style.width = `${progress}%`;

  $("progressTrack").setAttribute(
    "aria-valuenow",
    String(Math.round(progress))
  );

  if (progress >= 100) {
    $("progressCaption").textContent =
      "Target tercapai! Saatnya mewujudkan impian! 🎹";
  } else if (progress >= 75) {
    $("progressCaption").textContent =
      "Tinggal sedikit lagi. Terus konsisten!";
  } else if (progress >= 50) {
    $("progressCaption").textContent =
      "Sudah lebih dari separuh perjalanan!";
  } else if (progress >= 25) {
    $("progressCaption").textContent =
      "Fondasi tabunganmu mulai terbentuk.";
  } else if (balance > 0) {
    $("progressCaption").textContent =
      "Setiap setoran tetap membawa kemajuan.";
  } else {
    $("progressCaption").textContent =
      "Ayo mulai perjalananmu!";
  }

  renderMilestones();
  renderEstimate();
}

/* =========================================
   CUSTOM TARGET
========================================= */

$("editTargetBtn").addEventListener("click", () => {
  $("newTarget").value = String(data.target);
  $("targetDialog").showModal();
  $("newTarget").focus();
});

$("cancelTargetBtn").addEventListener("click", () => {
  $("targetDialog").close();
});

$("targetDialog").addEventListener("click", (event) => {
  if (event.target === $("targetDialog")) {
    $("targetDialog").close();
  }
});

$("targetForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const target = Number($("newTarget").value);

  if (!validAmount(target)) {
    showToast("Target harus berupa bilangan rupiah positif.");
    return;
  }

  const previousTarget = data.target;
  data.target = target;

  if (!saveData()) {
    data.target = previousTarget;
    return;
  }

  $("targetDialog").close();
  renderAll();
  showToast(`Target baru: ${rupiah(target)}`);
});

/* =========================================
   MILESTONES
========================================= */

function renderMilestones() {
  const progress = getProgress();

  document.querySelectorAll("[data-milestone]").forEach((element) => {
    const level = Number(element.dataset.milestone);
    const unlocked = progress >= level;

    element.classList.toggle("unlocked", unlocked);

    if (unlocked) {
      element.setAttribute("aria-label", `${level}% tercapai`);
    } else {
      element.removeAttribute("aria-label");
    }
  });
}

/* =========================================
   ESTIMATED COMPLETION DATE
========================================= */

function addCalendarDays(date, days) {
  const result = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    12
  );

  result.setDate(result.getDate() + days);
  return result;
}

function getEstimatedDate() {
  const remaining = getRemaining();

  if (remaining === 0) {
    return {
      complete: true,
      date: null,
      days: 0
    };
  }

  if (!validAmount(data.weekly)) {
    return null;
  }

  // Menganggap setoran mingguan dilakukan sekali setiap 7 hari.
  const weeks = Math.ceil(remaining / data.weekly);
  const days = weeks * 7;

  return {
    complete: false,
    date: addCalendarDays(new Date(), days),
    days
  };
}

function formatDuration(totalDays) {
  let remainingDays = totalDays;

  const years = Math.floor(remainingDays / 365);
  remainingDays %= 365;

  const months = Math.floor(remainingDays / 30);
  remainingDays %= 30;

  const parts = [];

  if (years > 0) parts.push(`${years} tahun`);
  if (months > 0) parts.push(`${months} bulan`);
  if (remainingDays > 0) parts.push(`${remainingDays} hari`);

  return parts.length ? parts.join(" ") : "kurang dari sehari";
}

function renderEstimate() {
  const estimate = getEstimatedDate();

  if (getRemaining() === 0) {
    $("targetDate").textContent = "Target tercapai!";
    $("estimateDuration").textContent =
      "Impianmu sudah masuk jangkauan. 🎹";
    return;
  }

  if (!estimate) {
    $("targetDate").textContent = "Belum dihitung";
    $("estimateDuration").textContent =
      "Masukkan rencana setoran mingguan yang valid.";
    return;
  }

  $("targetDate").textContent =
    estimate.date.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric"
    });

  $("estimateDuration").textContent =
    `Sekitar ${formatDuration(estimate.days)} lagi, ` +
    `dengan setoran ${rupiah(data.weekly)} per minggu.`;
}

/* =========================================
   ADD DEPOSIT
========================================= */

$("depositDate").value = todayISO();

$("depositForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const amount = Number($("amount").value);
  const date = $("depositDate").value;
  const note = $("note").value.trim() || "Setoran tabungan";

  if (!validAmount(amount)) {
    showToast("Masukkan nominal rupiah positif tanpa desimal.");
    return;
  }

  if (!date || date > todayISO()) {
    showToast("Tanggal setoran tidak boleh di masa depan.");
    return;
  }

  if (!Number.isSafeInteger(getBalance() + amount)) {
    showToast("Total tabungan terlalu besar.");
    return;
  }

  const entry = {
    id: makeId(),
    amount,
    date,
    note
  };

  data.history.push(entry);

  if (!saveData()) {
    data.history.pop();
    return;
  }

  selectedDate = date;
  $("amount").value = "";
  $("note").value = "";

  renderAll();
  showToast(`Setoran ${rupiah(amount)} berhasil disimpan.`);
});

/* =========================================
   WEEKLY SAVING PLAN
========================================= */

$("weeklyGoal").value = String(data.weekly);

$("weeklyForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const weekly = Number($("weeklyGoal").value);

  if (!validAmount(weekly)) {
    showToast("Setoran mingguan harus lebih dari nol.");
    return;
  }

  const previousWeekly = data.weekly;
  data.weekly = weekly;

  if (!saveData()) {
    data.weekly = previousWeekly;
    return;
  }

  renderAll();
  showToast("Rencana setoran mingguan diperbarui.");
});

/* =========================================
   DEPOSIT HISTORY
========================================= */

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function renderHistory() {
  const entries = [...data.history].sort((a, b) =>
    b.date.localeCompare(a.date) || b.id.localeCompare(a.id)
  );

  $("historyCount").textContent = `${entries.length} transaksi`;

  if (entries.length === 0) {
    $("history").innerHTML =
      '<div class="empty-state">Belum ada setoran. Mulai dari langkah pertama!</div>';
    return;
  }

  $("history").innerHTML = entries.map((entry) => `
    <article class="history-item">
      <div class="history-icon" aria-hidden="true">＋</div>
      <div class="history-info">
        <strong>${escapeHTML(entry.note)}</strong>
        <small>${escapeHTML(dateLabel(entry.date))}</small>
      </div>
      <div class="history-right">
        <strong>+${rupiah(entry.amount)}</strong>
        <button
          class="delete-entry"
          type="button"
          data-delete="${escapeHTML(entry.id)}"
          aria-label="Hapus setoran ${rupiah(entry.amount)}"
        >Hapus</button>
      </div>
    </article>
  `).join("");
}

$("history").addEventListener("click", (event) => {
  const button = event.target.closest("[data-delete]");
  if (!button) return;

  deleteEntry(button.dataset.delete);
});

function deleteEntry(id) {
  const index = data.history.findIndex((entry) => entry.id === id);
  if (index < 0) return;

  const entry = data.history[index];

  const confirmed = confirm(
    `Hapus setoran ${rupiah(entry.amount)} tanggal ${dateLabel(entry.date)}?`
  );

  if (!confirmed) return;

  data.history.splice(index, 1);

  if (!saveData()) {
    data.history.splice(index, 0, entry);
    return;
  }

  renderAll();
  showToast("Setoran berhasil dihapus.");
}

/* =========================================
   BACKUP AND RESTORE
========================================= */

$("exportBtn").addEventListener("click", () => {
  const backup = {
    format: "PA600_VAULT_BACKUP",
    version: 2,
    exportedAt: new Date().toISOString(),
    data
  };

  const blob = new Blob(
    [JSON.stringify(backup, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `pa600-backup-${todayISO()}.json`;

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("File backup berhasil dibuat.");
});

$("importFile").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const parsed = JSON.parse(await file.text());
    const imported = normalizeData(parsed.data || parsed);

    if (!Array.isArray((parsed.data || parsed).history)) {
      throw new Error("File tidak memiliki riwayat yang valid.");
    }

    const sourceHistory = (parsed.data || parsed).history;

    if (!sourceHistory.every(validEntry)) {
      throw new Error("Ada transaksi yang tidak valid dalam backup.");
    }

    const confirmed = confirm(
      `Pulihkan ${imported.history.length} transaksi dari backup? ` +
      "Data tabungan saat ini akan diganti."
    );

    if (!confirmed) return;

    const previousData = data;
    data = imported;

    if (!saveData()) {
      data = previousData;
      return;
    }

    renderAll();
    showToast("Backup berhasil dipulihkan.");
  } catch (error) {
    showToast(error.message || "Gagal membaca file backup.");
  } finally {
    event.target.value = "";
  }
});

/* =========================================
   INITIAL RENDER
========================================= */

function renderAll() {
  renderSummary();
  renderHistory();
  $("weeklyGoal").value = String(data.weekly);
}

renderAll();

console.info("PA600 Vault siap digunakan.");

/* =========================================
   PIN LOCK
========================================= */

const PIN_KEY = "pa600_vault_pin_hash_v1";
const PIN_ATTEMPTS_KEY = "pa600_vault_pin_attempts_v1";

let pinBuffer = "";
let pinMode = "setup";
let pinFirstEntry = "";
let pinBusy = false;
let pinCooldownUntil = 0;

const pinScreen = $("pinScreen");
const pinApp = document.querySelector(".app-shell");

function updatePinDots() {
  $("pinDots").textContent = Array.from(
    { length: 6 },
    (_, index) => index < pinBuffer.length ? "●" : "○"
  ).join(" ");

  $("pinDots").setAttribute(
    "aria-label",
    `${pinBuffer.length} dari 6 digit dimasukkan`
  );
}

function resetPinInput(message) {
  pinBuffer = "";
  updatePinDots();
  $("pinMessage").textContent = message;
}

function showPinScreen(mode, message) {
  pinMode = mode;
  pinBuffer = "";

  // Hapus PIN pertama hanya saat memulai proses baru.
  if (
    mode === "setup" ||
    mode === "change-new" ||
    mode === "change-old" ||
    mode === "unlock"
  ) {
    pinFirstEntry = "";
  }

  pinScreen.hidden = false;
  pinApp.hidden = true;

  $("pinTitle").textContent =
    mode === "setup" ? "Buat PIN" :
    mode === "confirm" ? "Konfirmasi PIN" :
    mode === "change-old" ? "PIN lama" :
    mode === "change-new" ? "PIN baru" :
    mode === "change-confirm" ? "Konfirmasi PIN baru" :
    "Selamat datang";

  $("pinDescription").textContent =
    mode === "setup" ? "Buat PIN 6 digit untuk dashboard tabungan." :
    mode === "confirm" ? "Masukkan kembali PIN yang sama." :
    mode === "change-old" ? "Masukkan PIN saat ini." :
    mode === "change-new" ? "Pilih PIN baru 6 digit." :
    mode === "change-confirm" ? "Masukkan kembali PIN baru." :
    "Masukkan PIN untuk membuka tabunganmu.";

  $("forgotPinBtn").hidden = mode !== "unlock";

  resetPinInput(message || (
    mode === "setup" ? "Masukkan PIN baru" :
    mode === "confirm" ? "Ulangi PIN untuk konfirmasi" :
    mode === "change-old" ? "Masukkan PIN lama" :
    mode === "change-new" ? "Masukkan PIN baru" :
    mode === "change-confirm" ? "Ulangi PIN baru" :
    "Masukkan PIN 6 digit"
  ));
}

async function hashLocalPin(pin) {
  const bytes = new TextEncoder().encode(pin);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getPinAttempts() {
  try {
    return Number(localStorage.getItem(PIN_ATTEMPTS_KEY)) || 0;
  } catch {
    return 0;
  }
}

async function submitPin() {
  if (pinBusy || pinBuffer.length !== 6) return;

  if (Date.now() < pinCooldownUntil) {
    resetPinInput("Tunggu sebentar sebelum mencoba lagi.");
    return;
  }

  const entered = pinBuffer;
  pinBuffer = "";
  updatePinDots();
  pinBusy = true;

  try {
    if (pinMode === "setup" || pinMode === "change-new") {
      pinFirstEntry = entered;
      showPinScreen(
        pinMode === "setup" ? "confirm" : "change-confirm"
      );
      return;
    }

    if (pinMode === "confirm" || pinMode === "change-confirm") {
      if (entered !== pinFirstEntry) {
        pinFirstEntry = "";
        showPinScreen(
          pinMode === "confirm" ? "setup" : "change-new",
          "PIN tidak cocok. Silakan ulangi."
        );
        return;
      }

      const hash = await hashLocalPin(entered);
      localStorage.setItem(PIN_KEY, hash);
      localStorage.setItem(PIN_ATTEMPTS_KEY, "0");
      openVault();
      showToast("PIN berhasil disimpan.");
      return;
    }

    const savedHash = localStorage.getItem(PIN_KEY);
    const enteredHash = await hashLocalPin(entered);

    if (pinMode === "change-old") {
      if (enteredHash !== savedHash) {
        resetPinInput("PIN lama salah.");
        return;
      }

      showPinScreen("change-new");
      return;
    }

    if (enteredHash === savedHash) {
      localStorage.setItem(PIN_ATTEMPTS_KEY, "0");
      openVault();
      return;
    }

    const attempts = getPinAttempts() + 1;
    localStorage.setItem(PIN_ATTEMPTS_KEY, String(attempts));

    if (attempts >= 5) {
      pinCooldownUntil = Date.now() + 30000;
      localStorage.setItem(PIN_ATTEMPTS_KEY, "0");
      resetPinInput("Terlalu banyak percobaan. Tunggu 30 detik.");
      showToast("Coba lagi setelah 30 detik.");
    } else {
      resetPinInput(`PIN salah. Sisa percobaan: ${5 - attempts}.`);
    }
  } catch (error) {
    console.error(error);
    resetPinInput("Gagal memproses PIN di browser.");
  } finally {
    pinBusy = false;
  }
}

function openVault() {
  pinScreen.hidden = true;
  pinApp.hidden = false;
  pinBuffer = "";
  renderAll();
}

document.querySelectorAll("[data-pin-key]").forEach((button) => {
  button.addEventListener("click", () => {
    if (pinBusy || pinBuffer.length >= 6) return;

    pinBuffer += button.dataset.pinKey;
    updatePinDots();

    if (pinBuffer.length === 6) submitPin();
  });
});

document.querySelectorAll("[data-pin-action]").forEach((button) => {
  button.addEventListener("click", () => {
    if (pinBusy) return;

    if (button.dataset.pinAction === "clear") {
      pinBuffer = pinBuffer.slice(0, -1);
      updatePinDots();
    }

    if (button.dataset.pinAction === "enter") {
      submitPin();
    }
  });
});

document.addEventListener("keydown", (event) => {
  if (pinScreen.hidden || pinBusy) return;

  if (/^\d$/.test(event.key) && pinBuffer.length < 6) {
    pinBuffer += event.key;
    updatePinDots();

    if (pinBuffer.length === 6) submitPin();
  } else if (event.key === "Backspace") {
    pinBuffer = pinBuffer.slice(0, -1);
    updatePinDots();
  } else if (event.key === "Enter") {
    submitPin();
  }
});

const lockButton = document.createElement("button");
lockButton.type = "button";
lockButton.className = "button button-outline";
lockButton.textContent = "🔒 Kunci dashboard";
lockButton.style.marginBottom = "18px";
lockButton.addEventListener("click", () => showPinScreen("unlock"));

document.querySelector("main").prepend(lockButton);

$("forgotPinBtn").addEventListener("click", () => {
  const confirmed = confirm(
    "Reset akses lokal akan menghapus PIN dan data tabungan lokal " +
    "agar kamu dapat membuat PIN baru. Pastikan backup tersedia. Lanjutkan?"
  );

  if (!confirmed) return;

  const alsoDeleteData = confirm(
    "Hapus juga riwayat tabungan, target, dan rencana mingguan dari browser ini?"
  );

  localStorage.removeItem(PIN_KEY);
  localStorage.removeItem(PIN_ATTEMPTS_KEY);

  if (alsoDeleteData) {
    localStorage.removeItem(STORAGE_KEY);
    data = defaultData();
    saveData();
  }

  showPinScreen("setup");
});

if (!window.crypto?.subtle) {
  showToast("Browser ini tidak mendukung pengolahan PIN. Gunakan HTTPS atau localhost.");
}

if (localStorage.getItem(PIN_KEY)) {
  showPinScreen("unlock");
} else {
  showPinScreen("setup");
}