const LAST_OPENED_KEY = "flipal.lastOpenedDate";

const state = {
  entries: [],
  map: new Map(),
  deviceToday: isoDate(new Date()),
  pageDate: isoDate(new Date()),
  view: "home",
  detailDate: null,
};

const el = {
  tabs: Array.from(document.querySelectorAll(".tab")),
  views: {
    home: document.getElementById("view-home"),
    archive: document.getElementById("view-archive"),
    detail: document.getElementById("view-detail"),
  },
  todayLabel: document.getElementById("todayLabel"),
  homeImage: document.getElementById("homeImage"),
  homeMessage: document.getElementById("homeMessage"),
  flipButton: document.getElementById("flipButton"),
  flipStatus: document.getElementById("flipStatus"),
  archiveGrid: document.getElementById("archiveGrid"),
  detailDate: document.getElementById("detailDate"),
  detailImage: document.getElementById("detailImage"),
  detailMessage: document.getElementById("detailMessage"),
  backToArchive: document.getElementById("backToArchive"),
  prevDetail: document.getElementById("prevDetail"),
  nextDetail: document.getElementById("nextDetail"),
  curlOverlay: document.getElementById("curlOverlay"),
  pageContainer: document.getElementById("pageContainer"),
};

init();

async function init() {
  wireEvents();
  await loadEntries();
  updateTodayState();
  renderHome();
  renderArchive();
  updateFlipState();

  setInterval(() => {
    const nextDeviceToday = isoDate(new Date());
    if (nextDeviceToday !== state.deviceToday) {
      state.deviceToday = nextDeviceToday;
      renderHome();
      renderArchive();
      if (state.view === "detail" && state.detailDate) {
        renderDetail(state.detailDate);
      }
    }
    updateFlipState();
  }, 1000);
}

async function loadEntries() {
  const res = await fetch("./assets/index.json", { cache: "no-store" });
  const json = await res.json();
  state.entries = (json.entries || [])
    .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  state.map = new Map(state.entries.map((item) => [item.date, item]));
}

function wireEvents() {
  el.tabs.forEach((tab) => {
    tab.addEventListener("click", () => showView(tab.dataset.view));
  });

  el.backToArchive.addEventListener("click", () => showView("archive"));

  el.flipButton.addEventListener("click", onFlipAction);
  el.pageContainer.addEventListener("touchstart", onSwipeStart, { passive: true });
  el.pageContainer.addEventListener("touchend", onSwipeEnd, { passive: true });

  el.prevDetail.addEventListener("click", () => moveDetail(-1));
  el.nextDetail.addEventListener("click", () => moveDetail(1));
}

function updateTodayState() {
  const labelDate = formatJPDate(state.pageDate);
  el.todayLabel.textContent = `${labelDate} のページ`;
  localStorage.setItem(LAST_OPENED_KEY, state.pageDate);
}

function renderHome() {
  const entry = state.map.get(state.pageDate);
  setImage(el.homeImage, entry?.image || "", state.pageDate);
  el.homeMessage.textContent = entry?.message || "";
}

function renderArchive() {
  const html = state.entries
    .map((entry) => {
      const locked = isFuture(entry.date);
      const thumb = entry.image || "";
      return `
      <article class="archive-item ${locked ? "locked" : ""}" data-date="${entry.date}" ${locked ? 'aria-disabled="true"' : ""}>
        <img src="${escapeHtml(thumb)}" alt="${entry.date}" loading="lazy" onerror="this.removeAttribute('src')" />
        <div class="archive-meta">
          <div>${formatJPDate(entry.date)}</div>
          ${locked ? '<div class="lock-badge">\uD83D\uDD12 未来日は閲覧できません</div>' : ""}
        </div>
      </article>`;
    })
    .join("");
  el.archiveGrid.innerHTML = html;

  Array.from(el.archiveGrid.querySelectorAll(".archive-item")).forEach((node) => {
    const date = node.dataset.date;
    const locked = isFuture(date);
    node.addEventListener("click", () => {
      if (locked) {
        alert("未来のページは開けません。");
        return;
      }
      showDetail(date);
    });
  });
}

function showDetail(date) {
  state.detailDate = date;
  renderDetail(date);
  showView("detail");
}

function renderDetail(date) {
  const entry = state.map.get(date);
  if (!entry) return;

  el.detailDate.textContent = `${formatJPDate(date)} の記録`;
  setImage(el.detailImage, entry.image || "", date);
  el.detailMessage.textContent = entry.message || "";

  const unlockedDates = state.entries.map((e) => e.date).filter((d) => !isFuture(d));
  const idx = unlockedDates.indexOf(date);
  const prevDate = idx > 0 ? unlockedDates[idx - 1] : null;
  const nextDate = idx >= 0 && idx < unlockedDates.length - 1 ? unlockedDates[idx + 1] : null;

  el.prevDetail.disabled = !prevDate;
  el.nextDetail.disabled = !nextDate;
  el.prevDetail.dataset.target = prevDate || "";
  el.nextDetail.dataset.target = nextDate || "";
}

function moveDetail(direction) {
  const target = direction < 0 ? el.prevDetail.dataset.target : el.nextDetail.dataset.target;
  if (!target) return;
  state.detailDate = target;
  renderDetail(target);
}

function showView(viewName) {
  state.view = viewName;
  Object.entries(el.views).forEach(([key, node]) => {
    node.classList.toggle("active", key === viewName);
  });
  el.tabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === viewName);
  });
}

function updateFlipState() {
  const nextPage = nextDate(state.pageDate);
  const canFlip = nextPage <= state.deviceToday;
  el.flipButton.disabled = !canFlip;

  if (canFlip) {
    el.flipStatus.textContent = "次のページを開けます。";
  } else {
    el.flipStatus.textContent = "次のページは 00:00 以降に開けます。";
  }
}

let swipeStartX = null;
function onSwipeStart(event) {
  swipeStartX = event.changedTouches?.[0]?.clientX ?? null;
}

function onSwipeEnd(event) {
  if (swipeStartX === null) return;
  const endX = event.changedTouches?.[0]?.clientX ?? swipeStartX;
  const delta = swipeStartX - endX;
  swipeStartX = null;
  if (delta > 60) {
    onFlipAction();
  }
}

function onFlipAction() {
  if (el.flipButton.disabled) return;

  playFlipAnimation();

  const next = nextDate(state.pageDate);
  const nextEntry = state.map.get(next);

  setTimeout(() => {
    state.pageDate = next;
    updateTodayState();
    setImage(el.homeImage, nextEntry?.image || "", next);
    el.homeMessage.textContent = nextEntry?.message || "";
    renderArchive();
    updateFlipState();
  }, 500);
}

function playFlipAnimation() {
  el.curlOverlay.classList.remove("play");
  void el.curlOverlay.offsetWidth;
  el.curlOverlay.classList.add("play");
  spawnConfetti(12);
}

function spawnConfetti(count) {
  for (let i = 0; i < count; i += 1) {
    const node = document.createElement("span");
    node.className = "confetti";
    node.style.left = `${15 + Math.random() * 70}vw`;
    node.style.top = `${20 + Math.random() * 20}vh`;
    node.style.background = ["#e95d4f", "#f5b341", "#14a098", "#3f7aee"][Math.floor(Math.random() * 4)];
    node.style.animationDuration = `${520 + Math.random() * 480}ms`;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 1100);
  }
}

function setImage(node, src, date) {
  if (src) {
    node.src = src;
    node.alt = `${formatJPDate(date)} の画像`;
  } else {
    node.removeAttribute("src");
    node.alt = `${formatJPDate(date)} のプレースホルダー`;
  }
}

function isFuture(targetDate) {
  return targetDate > state.deviceToday;
}

function isoDate(d) {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function nextDate(iso) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return isoDate(d);
}

function formatJPDate(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function escapeHtml(v) {
  return String(v)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
