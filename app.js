(function () {
  "use strict";

  const STORAGE_KEY = "summerCalendar.data.v1";
  const DONE_KEY = "summerCalendar.done.v1";
  const TYPE_META = {
    course: { label: "课程", color: "#2f80ed", soft: "#e8f1ff", dark: "#1657a6" },
    trip: { label: "出行", color: "#0f9f7a", soft: "#e5f7f1", dark: "#087357" },
    family: { label: "家庭", color: "#d46b08", soft: "#fff0df", dark: "#944607" },
    todo: { label: "提醒", color: "#8a5cf6", soft: "#f0eaff", dark: "#5834b3" }
  };
  const DEFAULT_DATA_VERSION =
    window.SUMMER_CALENDAR_DATA && window.SUMMER_CALENDAR_DATA.dataVersion
      ? window.SUMMER_CALENDAR_DATA.dataVersion
      : "local-default";

  const els = {
    childName: document.querySelector("#child-name"),
    dateLine: document.querySelector("#date-line"),
    nextEvent: document.querySelector("#next-event"),
    tabs: document.querySelectorAll(".tab-button"),
    views: document.querySelectorAll(".view"),
    filterGroup: document.querySelector("#type-filters"),
    searchInput: document.querySelector("#search-input"),
    todayList: document.querySelector("#today-list"),
    allList: document.querySelector("#all-list"),
    selectedDayList: document.querySelector("#selected-day-list"),
    calendarTitle: document.querySelector("#calendar-title"),
    selectedDateTitle: document.querySelector("#selected-date-title"),
    calendarGrid: document.querySelector("#calendar-grid"),
    profileForm: document.querySelector("#profile-form"),
    eventModal: document.querySelector("#event-modal"),
    eventForm: document.querySelector("#event-form"),
    modalTitle: document.querySelector("#modal-title"),
    jsonImport: document.querySelector("#json-import"),
    toast: document.querySelector("#toast")
  };

  let state = {
    data: loadData(),
    done: loadDone(),
    view: "today",
    filter: "all",
    query: "",
    selectedDate: toDateKey(new Date()),
    monthDate: startOfMonth(new Date())
  };

  ingestHashData();
  state.data.events = normalizeEvents(state.data.events);
  const firstFuture = getVisibleEvents().find((event) => event.date >= toDateKey(new Date()));
  if (firstFuture) {
    state.monthDate = startOfMonth(parseDateKey(firstFuture.date));
    state.selectedDate = firstFuture.date;
  }

  bindEvents();
  render();

  function loadData() {
    const defaultData = normalizeData(window.SUMMER_CALENDAR_DATA);
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const rawData = JSON.parse(saved);
        const savedData = normalizeData(rawData);
        if (shouldUseDefaultOverSaved(rawData, savedData)) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultData));
          return defaultData;
        }
        return savedData;
      } catch (error) {
        console.warn("Saved schedule is invalid, falling back to defaults.", error);
      }
    }
    return defaultData;
  }

  function loadDone() {
    try {
      return JSON.parse(localStorage.getItem(DONE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function normalizeData(data) {
    return {
      dataVersion: data && data.dataVersion ? String(data.dataVersion) : DEFAULT_DATA_VERSION,
      childName: data && data.childName ? String(data.childName) : "小朋友",
      primaryPhone: data && data.primaryPhone ? String(data.primaryPhone) : "",
      events: normalizeEvents((data && data.events) || [])
    };
  }

  function shouldUseDefaultOverSaved(rawData, savedData) {
    if (rawData && rawData.dataVersion) return false;
    return savedData.events.some((event) =>
      ["游泳提高班", "创意美术课", "数学思维课", "科学实验营"].includes(event.title)
    );
  }

  function normalizeEvents(events) {
    return events
      .map((event, index) => ({
        id: event.id || `event-${Date.now()}-${index}`,
        type: TYPE_META[event.type] ? event.type : "todo",
        title: event.title || "未命名安排",
        date: event.date || toDateKey(new Date()),
        start: event.start || "09:00",
        end: event.end || "",
        leaveTime: event.leaveTime || "",
        location: event.location || "",
        address: event.address || "",
        contactName: event.contactName || "",
        contactPhone: event.contactPhone || "",
        bag: Array.isArray(event.bag)
          ? event.bag
          : String(event.bag || "")
              .split(/[、,，]/)
              .map((item) => item.trim())
              .filter(Boolean),
        notes: event.notes || ""
      }))
      .sort(compareEvents);
  }

  function bindEvents() {
    document.addEventListener("click", handleDocumentClick);
    els.tabs.forEach((button) => {
      button.addEventListener("click", () => setView(button.dataset.view));
    });
    els.filterGroup.addEventListener("click", (event) => {
      const button = event.target.closest("[data-filter]");
      if (!button) return;
      state.filter = button.dataset.filter;
      els.filterGroup.querySelectorAll(".filter-chip").forEach((chip) => {
        chip.classList.toggle("is-active", chip === button);
      });
      renderLists();
      renderCalendar();
    });
    els.searchInput.addEventListener("input", () => {
      state.query = els.searchInput.value.trim().toLowerCase();
      renderLists();
      renderCalendar();
    });
    els.profileForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(els.profileForm);
      state.data.childName = formData.get("childName").trim() || "小朋友";
      state.data.primaryPhone = formData.get("primaryPhone").trim();
      persistData();
      render();
      showToast("资料已保存");
    });
    els.eventForm.addEventListener("submit", (event) => {
      event.preventDefault();
      saveEventFromForm();
    });
    els.jsonImport.addEventListener("change", importJson);
  }

  function handleDocumentClick(event) {
    const actionTarget = event.target.closest("[data-action]");
    const dateTarget = event.target.closest("[data-date]");
    if (dateTarget && dateTarget.dataset.date) {
      state.selectedDate = dateTarget.dataset.date;
      state.monthDate = startOfMonth(parseDateKey(state.selectedDate));
      setView("calendar");
      renderCalendar();
      renderLists();
      return;
    }
    if (!actionTarget) return;

    const action = actionTarget.dataset.action;
    const id = actionTarget.dataset.id;
    if (action === "prev-month") moveMonth(-1);
    if (action === "next-month") moveMonth(1);
    if (action === "add-event") openEventModal();
    if (action === "edit-event") openEventModal(id);
    if (action === "delete-event") deleteEventFromForm();
    if (action === "close-modal") closeModal();
    if (action === "toggle-done") toggleDone(id);
    if (action === "navigate") openNavigation(id);
    if (action === "call") callContact(id);
    if (action === "copy-place") copyPlace(id);
    if (action === "copy-share-link") copyShareLink();
    if (action === "export-json") exportJson();
    if (action === "export-ics") exportIcs();
    if (action === "reset-data") resetData();
  }

  function setView(view) {
    state.view = view;
    els.tabs.forEach((button) => button.classList.toggle("is-active", button.dataset.view === view));
    els.views.forEach((viewEl) => viewEl.classList.toggle("is-active", viewEl.id === `view-${view}`));
    if (view === "manage") fillProfileForm();
  }

  function render() {
    els.childName.textContent = `${state.data.childName}的暑期日历`;
    els.dateLine.textContent = formatLongDate(toDateKey(new Date()));
    fillProfileForm();
    renderNextEvent();
    renderCalendar();
    renderLists();
  }

  function renderNextEvent() {
    const nowKey = toDateKey(new Date());
    const future = state.data.events
      .filter((event) => event.date >= nowKey && !state.done[event.id])
      .sort(compareEvents);
    const next = future[0];
    if (!next) {
      els.nextEvent.innerHTML = `
        <div class="empty-state tight">
          <strong>暂无未完成安排</strong>
          <span>后面新增日程会显示在这里。</span>
        </div>
      `;
      return;
    }
    const meta = TYPE_META[next.type];
    els.nextEvent.innerHTML = `
      <div class="next-main">
        <span class="type-pill" style="--type-color:${meta.color};--type-soft:${meta.soft};--type-dark:${meta.dark}">${meta.label}</span>
        <strong>${escapeHtml(next.title)}</strong>
        <span>${formatShortDate(next.date)} ${next.start}${next.end ? `-${next.end}` : ""}</span>
      </div>
      <div class="next-side">
        ${next.leaveTime ? `<span>出发 ${next.leaveTime}</span>` : ""}
        ${next.location ? `<span>${escapeHtml(next.location)}</span>` : ""}
      </div>
    `;
  }

  function renderCalendar() {
    const monthStart = startOfMonth(state.monthDate);
    const year = monthStart.getFullYear();
    const month = monthStart.getMonth();
    els.calendarTitle.textContent = `${year} 年 ${month + 1} 月`;
    els.selectedDateTitle.textContent = formatLongDate(state.selectedDate);

    const start = new Date(year, month, 1);
    const firstWeekday = (start.getDay() + 6) % 7;
    const gridStart = new Date(year, month, 1 - firstWeekday);
    const eventsByDate = groupByDate(getVisibleEvents());
    const todayKey = toDateKey(new Date());
    const cells = [];
    for (let i = 0; i < 42; i += 1) {
      const day = new Date(gridStart);
      day.setDate(gridStart.getDate() + i);
      const key = toDateKey(day);
      const dayEvents = eventsByDate.get(key) || [];
      const dots = dayEvents
        .slice(0, 4)
        .map((eventItem) => `<i style="background:${TYPE_META[eventItem.type].color}"></i>`)
        .join("");
      cells.push(`
        <button type="button"
          class="day-cell ${day.getMonth() === month ? "" : "is-muted"} ${key === todayKey ? "is-today" : ""} ${key === state.selectedDate ? "is-selected" : ""}"
          data-date="${key}"
          aria-label="${formatLongDate(key)}，${dayEvents.length} 项安排">
          <span>${day.getDate()}</span>
          <em>${dayEvents.length ? dayEvents.length : ""}</em>
          <div class="event-dots">${dots}</div>
        </button>
      `);
    }
    els.calendarGrid.innerHTML = cells.join("");
    renderSelectedDayList();
  }

  function renderLists() {
    const todayKey = toDateKey(new Date());
    const todayEvents = getVisibleEvents().filter((event) => event.date === todayKey);
    const selectedEvents = getVisibleEvents().filter((event) => event.date === state.selectedDate);
    const allEvents = getVisibleEvents();

    els.todayList.innerHTML = todayEvents.length
      ? todayEvents.map(renderEventCard).join("")
      : renderEmptyState("今天没有安排", "可切到清单查看后续课程和出行。");
    els.allList.innerHTML = allEvents.length
      ? allEvents.map(renderEventCard).join("")
      : renderEmptyState("没有匹配安排", "换个筛选条件试试。");
    els.selectedDayList.innerHTML = selectedEvents.length
      ? selectedEvents.map(renderEventCard).join("")
      : renderEmptyState("这天没有安排", "新增安排后会显示在这里。");
    renderNextEvent();
  }

  function renderSelectedDayList() {
    const selectedEvents = getVisibleEvents().filter((event) => event.date === state.selectedDate);
    els.selectedDayList.innerHTML = selectedEvents.length
      ? selectedEvents.map(renderEventCard).join("")
      : renderEmptyState("这天没有安排", "新增安排后会显示在这里。");
  }

  function renderEventCard(event) {
    const meta = TYPE_META[event.type];
    const isDone = Boolean(state.done[event.id]);
    const placeLine = [event.location, event.address].filter(Boolean).join(" · ");
    const bagLine = event.bag.length ? event.bag.map((item) => `<span>${escapeHtml(item)}</span>`).join("") : "";
    return `
      <article class="event-card ${isDone ? "is-done" : ""}" style="--type-color:${meta.color};--type-soft:${meta.soft};--type-dark:${meta.dark}">
        <div class="event-time">
          <strong>${event.start}</strong>
          <span>${event.end || " "}</span>
          ${event.leaveTime ? `<small>出发 ${event.leaveTime}</small>` : ""}
        </div>
        <div class="event-body">
          <div class="event-title-row">
            <span class="type-pill" style="--type-color:${meta.color}">${meta.label}</span>
            <h3>${escapeHtml(event.title)}</h3>
          </div>
          <p class="event-date">${formatShortDate(event.date)}</p>
          ${placeLine ? `<p class="event-place">${escapeHtml(placeLine)}</p>` : ""}
          ${event.contactName || event.contactPhone ? `<p class="event-contact">${escapeHtml(event.contactName)} ${escapeHtml(event.contactPhone)}</p>` : ""}
          ${bagLine ? `<div class="bag-list">${bagLine}</div>` : ""}
          ${event.notes ? `<p class="event-notes">${escapeHtml(event.notes)}</p>` : ""}
          <div class="event-actions">
            <button type="button" class="mini-button" data-action="toggle-done" data-id="${escapeHtml(event.id)}">${isDone ? "已完成" : "完成"}</button>
            <button type="button" class="mini-button" data-action="navigate" data-id="${escapeHtml(event.id)}">导航</button>
            <button type="button" class="mini-button" data-action="call" data-id="${escapeHtml(event.id)}">电话</button>
            <button type="button" class="mini-button" data-action="copy-place" data-id="${escapeHtml(event.id)}">复制地点</button>
            <button type="button" class="mini-button" data-action="edit-event" data-id="${escapeHtml(event.id)}">编辑</button>
          </div>
        </div>
      </article>
    `;
  }

  function renderEmptyState(title, subtitle) {
    return `
      <div class="empty-state">
        <strong>${title}</strong>
        <span>${subtitle}</span>
      </div>
    `;
  }

  function getVisibleEvents() {
    const query = state.query;
    return state.data.events.filter((event) => {
      const matchesType = state.filter === "all" || event.type === state.filter;
      const haystack = [
        event.title,
        event.location,
        event.address,
        event.contactName,
        event.notes,
        event.bag.join(" ")
      ]
        .join(" ")
        .toLowerCase();
      return matchesType && (!query || haystack.includes(query));
    });
  }

  function groupByDate(events) {
    const map = new Map();
    events.forEach((event) => {
      if (!map.has(event.date)) map.set(event.date, []);
      map.get(event.date).push(event);
    });
    return map;
  }

  function moveMonth(offset) {
    state.monthDate = new Date(state.monthDate.getFullYear(), state.monthDate.getMonth() + offset, 1);
    renderCalendar();
  }

  function openEventModal(id) {
    const event = id ? state.data.events.find((item) => item.id === id) : null;
    els.modalTitle.textContent = event ? "编辑安排" : "新增安排";
    els.eventForm.reset();
    els.eventForm.elements.id.value = event ? event.id : "";
    els.eventForm.elements.type.value = event ? event.type : "course";
    els.eventForm.elements.title.value = event ? event.title : "";
    els.eventForm.elements.date.value = event ? event.date : state.selectedDate;
    els.eventForm.elements.start.value = event ? event.start : "09:00";
    els.eventForm.elements.end.value = event ? event.end : "";
    els.eventForm.elements.leaveTime.value = event ? event.leaveTime : "";
    els.eventForm.elements.location.value = event ? event.location : "";
    els.eventForm.elements.address.value = event ? event.address : "";
    els.eventForm.elements.contactName.value = event ? event.contactName : "";
    els.eventForm.elements.contactPhone.value = event ? event.contactPhone : state.data.primaryPhone || "";
    els.eventForm.elements.bag.value = event ? event.bag.join("、") : "";
    els.eventForm.elements.notes.value = event ? event.notes : "";
    els.eventForm.querySelector('[data-action="delete-event"]').style.visibility = event ? "visible" : "hidden";
    if (typeof els.eventModal.showModal === "function") {
      els.eventModal.showModal();
    } else {
      els.eventModal.setAttribute("open", "");
    }
  }

  function closeModal() {
    if (typeof els.eventModal.close === "function") {
      els.eventModal.close();
    } else {
      els.eventModal.removeAttribute("open");
    }
  }

  function saveEventFromForm() {
    const formData = new FormData(els.eventForm);
    const id = formData.get("id") || `event-${Date.now()}`;
    const nextEvent = {
      id,
      type: formData.get("type"),
      title: formData.get("title").trim(),
      date: formData.get("date"),
      start: formData.get("start"),
      end: formData.get("end"),
      leaveTime: formData.get("leaveTime"),
      location: formData.get("location").trim(),
      address: formData.get("address").trim(),
      contactName: formData.get("contactName").trim(),
      contactPhone: formData.get("contactPhone").trim(),
      bag: formData
        .get("bag")
        .split(/[、,，]/)
        .map((item) => item.trim())
        .filter(Boolean),
      notes: formData.get("notes").trim()
    };
    const existingIndex = state.data.events.findIndex((event) => event.id === id);
    if (existingIndex >= 0) {
      state.data.events.splice(existingIndex, 1, nextEvent);
    } else {
      state.data.events.push(nextEvent);
    }
    state.data.events = normalizeEvents(state.data.events);
    state.selectedDate = nextEvent.date;
    state.monthDate = startOfMonth(parseDateKey(nextEvent.date));
    persistData();
    closeModal();
    render();
    showToast("安排已保存");
  }

  function deleteEventFromForm() {
    const id = els.eventForm.elements.id.value;
    if (!id) return;
    state.data.events = state.data.events.filter((event) => event.id !== id);
    delete state.done[id];
    persistData();
    persistDone();
    closeModal();
    render();
    showToast("安排已删除");
  }

  function toggleDone(id) {
    state.done[id] = !state.done[id];
    if (!state.done[id]) delete state.done[id];
    persistDone();
    renderLists();
  }

  function openNavigation(id) {
    const event = findEvent(id);
    if (!event) return;
    const keyword = encodeURIComponent([event.location, event.address].filter(Boolean).join(" "));
    if (!keyword) {
      showToast("还没有填写地点");
      return;
    }
    window.location.href = `https://apis.map.qq.com/uri/v1/search?keyword=${keyword}&referer=summer-calendar`;
  }

  function callContact(id) {
    const event = findEvent(id);
    const phone = event && event.contactPhone ? event.contactPhone.replace(/[^\d+]/g, "") : state.data.primaryPhone;
    if (!phone) {
      showToast("还没有填写电话");
      return;
    }
    window.location.href = `tel:${phone}`;
  }

  function copyPlace(id) {
    const event = findEvent(id);
    if (!event) return;
    const text = [event.title, event.location, event.address, event.leaveTime ? `建议出发 ${event.leaveTime}` : ""]
      .filter(Boolean)
      .join("\n");
    copyText(text);
  }

  function copyShareLink() {
    const payload = encodeData({
      childName: state.data.childName,
      primaryPhone: state.data.primaryPhone,
      events: state.data.events
    });
    const base = `${location.origin}${location.pathname}`;
    copyText(`${base}#data=${payload}`, "分享链接已复制");
  }

  function exportJson() {
    downloadFile(
      `${state.data.childName}-暑期日历.json`,
      JSON.stringify(state.data, null, 2),
      "application/json;charset=utf-8"
    );
  }

  function importJson(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        state.data = normalizeData(JSON.parse(reader.result));
        persistData();
        render();
        showToast("数据已导入");
      } catch {
        showToast("导入失败，文件格式不对");
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsText(file);
  }

  function exportIcs() {
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Summer Calendar//CN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH"
    ];
    state.data.events.forEach((event) => {
      lines.push(
        "BEGIN:VEVENT",
        `UID:${event.id}@summer-calendar`,
        `DTSTAMP:${formatIcsDateTime(new Date())}`,
        `DTSTART;TZID=Asia/Shanghai:${formatIcsLocal(event.date, event.start)}`,
        `DTEND;TZID=Asia/Shanghai:${formatIcsLocal(event.date, event.end || addMinutes(event.start, 60))}`,
        `SUMMARY:${escapeIcs(event.title)}`,
        `LOCATION:${escapeIcs([event.location, event.address].filter(Boolean).join(" "))}`,
        `DESCRIPTION:${escapeIcs(buildIcsDescription(event))}`,
        "END:VEVENT"
      );
    });
    lines.push("END:VCALENDAR");
    downloadFile(`${state.data.childName}-暑期日历.ics`, lines.join("\r\n"), "text/calendar;charset=utf-8");
  }

  function resetData() {
    state.data = normalizeData(window.SUMMER_CALENDAR_DATA);
    state.done = {};
    persistData();
    persistDone();
    render();
    showToast("已恢复默认行程");
  }

  function fillProfileForm() {
    els.profileForm.elements.childName.value = state.data.childName;
    els.profileForm.elements.primaryPhone.value = state.data.primaryPhone;
  }

  function persistData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
  }

  function persistDone() {
    localStorage.setItem(DONE_KEY, JSON.stringify(state.done));
  }

  function ingestHashData() {
    if (!location.hash.startsWith("#data=")) return;
    try {
      const payload = decodeData(location.hash.slice(6));
      state.data = normalizeData(payload);
      persistData();
      history.replaceState(null, "", location.pathname);
      showToast("已载入分享日历");
    } catch (error) {
      console.warn("Invalid shared data.", error);
    }
  }

  function findEvent(id) {
    return state.data.events.find((event) => event.id === id);
  }

  function compareEvents(a, b) {
    return `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`);
  }

  function toDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function parseDateKey(key) {
    const [year, month, day] = key.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function formatLongDate(key) {
    const date = parseDateKey(key);
    return new Intl.DateTimeFormat("zh-CN", {
      month: "long",
      day: "numeric",
      weekday: "long"
    }).format(date);
  }

  function formatShortDate(key) {
    const date = parseDateKey(key);
    return new Intl.DateTimeFormat("zh-CN", {
      month: "numeric",
      day: "numeric",
      weekday: "short"
    }).format(date);
  }

  function addMinutes(time, minutes) {
    const [hour, minute] = time.split(":").map(Number);
    const date = new Date(2026, 0, 1, hour, minute + minutes);
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }

  function formatIcsLocal(dateKey, time) {
    return `${dateKey.replace(/-/g, "")}T${time.replace(":", "")}00`;
  }

  function formatIcsDateTime(date) {
    return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  }

  function buildIcsDescription(event) {
    return [
      event.leaveTime ? `建议出发：${event.leaveTime}` : "",
      event.contactName || event.contactPhone ? `联系人：${event.contactName} ${event.contactPhone}` : "",
      event.bag.length ? `物品：${event.bag.join("、")}` : "",
      event.notes
    ]
      .filter(Boolean)
      .join("\\n");
  }

  function escapeIcs(value) {
    return String(value || "")
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function copyText(text, message) {
    if (!text) return;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => showToast(message || "已复制"));
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-999px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
    showToast(message || "已复制");
  }

  function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  }

  function encodeData(data) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  }

  function decodeData(value) {
    return JSON.parse(decodeURIComponent(escape(atob(value))));
  }

  let toastTimer = null;
  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove("is-visible"), 1800);
  }
})();
