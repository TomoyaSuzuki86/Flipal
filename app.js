const LAST_OPENED_KEY = "flipal.lastOpenedDate";
const PULL_MAX = 150;
const RIP_THRESHOLD = 95;

const state = {
  entries: [],
  map: new Map(),
  deviceToday: isoDate(new Date()),
  testMode: false,
  pageDate: isoDate(new Date()),
  canFlip: false,
  view: "home",
  detailDate: null,
  archiveViewMode: "grid",
  calendarDate: new Date(),
};

const pullState = {
  active: false,
  startY: 0,
  pointerId: null,
  didRip: false,
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
  flipStatus: document.getElementById("flipStatus"),
  archiveGrid: document.getElementById("archiveGrid"),
  detailDate: document.getElementById("detailDate"),
  detailImage: document.getElementById("detailImage"),
  detailMessage: document.getElementById("detailMessage"),
  backToArchive: document.getElementById("backToArchive"),
  prevDetail: document.getElementById("prevDetail"),
  nextDetail: document.getElementById("nextDetail"),
  pageFlipper: document.querySelector(".page-flipper"),
  pageTurner: document.getElementById("page-turner"),
  nextImage: document.getElementById("nextImage"),
  tearLine: document.getElementById("tearLine"),

  gridViewBtn: document.getElementById("gridViewBtn"),
  calendarViewBtn: document.getElementById("calendarViewBtn"),
  archiveCalendar: document.getElementById("archiveCalendar"),
  calendarMonthLabel: null,
  prevMonthBtn: null,
  nextMonthBtn: null,
  testControls: document.getElementById("testControls"),
  testDateLabel: document.getElementById("testDateLabel"),
  testPrevDay: document.getElementById("testPrevDay"),
  testToday: document.getElementById("testToday"),
  testNextDay: document.getElementById("testNextDay"),
};

init();

async function init() {
  setupTestMode();
  wireEvents();
  await loadEntries();
  updateTodayState();
  renderHome();
  renderArchive();
  updateFlipState();

  setInterval(() => {
    if (state.testMode) {
      updateFlipState();
      return;
    }
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

  el.pageFlipper.addEventListener("pointerdown", onPullStart);
  el.pageFlipper.addEventListener("pointermove", onPullMove);
  el.pageFlipper.addEventListener("pointerup", onPullEnd);
  el.pageFlipper.addEventListener("pointercancel", onPullEnd);
  el.pageFlipper.addEventListener("pointerleave", onPullEnd);

  el.prevDetail.addEventListener("click", () => moveDetail(-1));
  el.nextDetail.addEventListener("click", () => moveDetail(1));

  el.gridViewBtn.addEventListener("click", () => showArchiveView("grid"));
  el.calendarViewBtn.addEventListener("click", () => showArchiveView("calendar"));

  if (state.testMode) {
    el.testPrevDay.addEventListener("click", () => shiftTestDate(-1));
    el.testNextDay.addEventListener("click", () => shiftTestDate(1));
    el.testToday.addEventListener("click", resetTestDateToReal);
  }
}

function updateTodayState() {
  const labelDate = formatJPDate(state.pageDate);
  el.todayLabel.textContent = labelDate;
  localStorage.setItem(LAST_OPENED_KEY, state.pageDate);
}

function renderHome() {
  const entry = state.map.get(state.pageDate);
  setImage(el.homeImage, entry?.image || "", state.pageDate);

  const next = nextDate(state.pageDate);
  const nextEntry = state.map.get(next);
  if (next <= state.deviceToday) {
    setImage(el.nextImage, nextEntry?.image || "", next);
  } else {
    setImage(el.nextImage, "", next);
  }
}

function renderGrid() {
  const html = state.entries
    .map((entry) => {
      const locked = isFuture(entry.date);
      const thumb = entry.image || "";
      return `
      <article class="archive-item ${locked ? "locked" : ""}" data-date="${entry.date}" ${locked ? 'aria-disabled="true"' : ""}>
        ${
          locked
            ? '<div class="archive-hidden-thumb" aria-hidden="true"><span>🔒</span></div>'
            : `<img src="${escapeHtml(thumb)}" alt="${entry.date}" loading="lazy" onerror="this.removeAttribute('src')" />`
        }
        <div class="archive-meta">
          <div>${formatJPDate(entry.date)}</div>
          ${locked ? '<div class="lock-badge">未来日は閲覧できません</div>' : ""}
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

function renderCalendar() {
  const todayIso = state.deviceToday;
  const currentMonth = state.calendarDate.getMonth();
  const currentYear = state.calendarDate.getFullYear();

  const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const startingDay = firstDayOfMonth.getDay();

  let calendarHtml = `
    <div class="calendar-header">
      <button id="prevMonthBtn" type="button">&lt;</button>
      <h3 id="calendarMonthLabel">${currentYear}年 ${currentMonth + 1}月</h3>
      <button id="nextMonthBtn" type="button">&gt;</button>
    </div>
    <div class="calendar-weekdays">
      <span>日</span><span>月</span><span>火</span><span>水</span><span>木</span><span>金</span><span>土</span>
    </div>
    <div class="calendar-grid">
  `;

  for (let i = 0; i < startingDay; i += 1) {
    calendarHtml += '<div class="calendar-day empty"></div>';
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(currentYear, currentMonth, day);
    const iso = isoDate(date);
    const entry = state.map.get(iso);
    const locked = isFuture(iso);
    const isToday = iso === todayIso;

    const classes = ["calendar-day"];
    if (locked) classes.push("locked");
    if (entry) classes.push("has-entry");
    if (isToday) classes.push("today");

    calendarHtml += `
      <div class="${classes.join(" ")}" data-date="${iso}">
        <span class="day-number">${day}</span>
        ${entry?.image && !locked ? `<img class="day-thumbnail" src="${escapeHtml(entry.image)}" alt="${iso}" />` : ""}
      </div>
    `;
  }

  calendarHtml += "</div>";
  el.archiveCalendar.innerHTML = calendarHtml;

  el.calendarMonthLabel = document.getElementById("calendarMonthLabel");
  el.prevMonthBtn = document.getElementById("prevMonthBtn");
  el.nextMonthBtn = document.getElementById("nextMonthBtn");

  el.prevMonthBtn.addEventListener("click", () => changeMonth(-1));
  el.nextMonthBtn.addEventListener("click", () => changeMonth(1));

  Array.from(el.archiveCalendar.querySelectorAll(".calendar-day")).forEach((node) => {
    const date = node.dataset.date;
    const locked = isFuture(date);
    if (!node.classList.contains("empty")) {
      node.addEventListener("click", () => {
        if (locked) {
          alert("未来のページは開けません。");
          return;
        }
        showDetail(date);
      });
    }
  });
}

function changeMonth(direction) {
  state.calendarDate.setMonth(state.calendarDate.getMonth() + direction);
  renderCalendar();
}

function renderArchive() {
  if (state.archiveViewMode === "grid") {
    el.archiveGrid.classList.add("active");
    el.archiveCalendar.classList.remove("active");
    renderGrid();
  } else {
    el.archiveGrid.classList.remove("active");
    el.archiveCalendar.classList.add("active");
    renderCalendar();
  }
}

function showArchiveView(mode) {
  state.archiveViewMode = mode;
  el.gridViewBtn.classList.toggle("active", mode === "grid");
  el.calendarViewBtn.classList.toggle("active", mode === "calendar");
  renderArchive();
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
  const nextDateValue = idx >= 0 && idx < unlockedDates.length - 1 ? unlockedDates[idx + 1] : null;

  el.prevDetail.disabled = !prevDate;
  el.nextDetail.disabled = !nextDateValue;
  el.prevDetail.dataset.target = prevDate || "";
  el.nextDetail.dataset.target = nextDateValue || "";
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
  state.canFlip = canFlip;

  if (canFlip) {
    el.flipStatus.textContent = "画像を下に引っ張ると次の日へめくれます。";
  } else {
    el.flipStatus.textContent = "次のページは 00:00 以降、画像を下に引っ張ると開けます。";
  }
}

function onPullStart(event) {
  if (state.view !== "home") return;
  if (event.pointerType === "mouse" && event.button !== 0) return;

  pullState.active = true;
  pullState.startY = event.clientY;
  pullState.pointerId = event.pointerId;
  pullState.didRip = false;
  el.pageFlipper.setPointerCapture(event.pointerId);
}

function onPullMove(event) {
  if (!pullState.active || event.pointerId !== pullState.pointerId) return;

  const pull = Math.max(0, Math.min(PULL_MAX, event.clientY - pullState.startY));
  applyPullVisual(pull);

  pullState.didRip = pull >= RIP_THRESHOLD && state.canFlip;
}

function onPullEnd(event) {
  if (!pullState.active || event.pointerId !== pullState.pointerId) return;

  if (el.pageFlipper.hasPointerCapture(event.pointerId)) {
    el.pageFlipper.releasePointerCapture(event.pointerId);
  }
  pullState.active = false;
  pullState.pointerId = null;

  if (pullState.didRip) {
    triggerRipFlip();
  } else {
    resetPullVisual();
  }
}

function applyPullVisual(pull) {
  const stretch = Math.min(0.2, pull / 600);
  el.pageFlipper.style.setProperty("--pull", `${pull}px`);
  el.pageFlipper.style.setProperty("--stretch", `${stretch}`);
  if (pull > 4) {
    el.pageFlipper.classList.add("pulling");
  } else {
    el.pageFlipper.classList.remove("pulling");
  }
}

function resetPullVisual() {
  el.pageFlipper.classList.remove("pulling");
  el.pageFlipper.style.setProperty("--pull", "0px");
  el.pageFlipper.style.setProperty("--stretch", "0");
}

function triggerRipFlip() {
  el.pageFlipper.classList.add("ripping");

  setTimeout(() => {
    // Confetti starts only after the pointer is released and rip animation begins.
    spawnConfetti(24);
    el.pageFlipper.classList.remove("ripping");
    resetPullVisual();
    onFlipAction(true);
  }, 300);
}

function setupTestMode() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("test") !== "1") return;

  state.testMode = true;
  const realToday = isoDate(new Date());
  const paramToday = params.get("testDate");
  state.deviceToday = /^\d{4}-\d{2}-\d{2}$/.test(paramToday || "") ? paramToday : realToday;
  if (state.pageDate > state.deviceToday) {
    state.pageDate = state.deviceToday;
  }
  el.testControls.hidden = false;
  refreshTestDateLabel();
}

function shiftTestDate(days) {
  state.deviceToday = addDays(state.deviceToday, days);
  refreshTestDateLabel();
  renderHome();
  renderArchive();
  if (state.view === "detail" && state.detailDate) {
    renderDetail(state.detailDate);
  }
  updateFlipState();
}

function resetTestDateToReal() {
  state.deviceToday = isoDate(new Date());
  refreshTestDateLabel();
  renderHome();
  renderArchive();
  if (state.view === "detail" && state.detailDate) {
    renderDetail(state.detailDate);
  }
  updateFlipState();
}

function refreshTestDateLabel() {
  if (!state.testMode) return;
  el.testDateLabel.textContent = `試験日付: ${state.deviceToday}`;
}

function onFlipAction(skipPageCurl = false) {
  if (!state.canFlip) return;

  if (skipPageCurl) {
    advancePage();
    return;
  }

  el.pageFlipper.classList.add("flipped");
  spawnConfetti(32);

  el.pageTurner.addEventListener(
    "transitionend",
    () => {
      el.pageFlipper.classList.remove("flipped");
      advancePage();
    },
    { once: true }
  );
}

function advancePage() {
  const next = nextDate(state.pageDate);
  state.pageDate = next;
  updateTodayState();
  renderHome();
  renderArchive();
  updateFlipState();
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

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
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
