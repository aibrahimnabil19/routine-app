import { getSupabase } from "./supabase-client.js";

let supabase, user, profile;
let tasks = []; // tasks joined with active item label + today's completion
let editingTaskId = null;
let currentType = "simple";
let itemCounter = 0;

const EMOJIS = [
  "📖",
  "💧",
  "🧘",
  "🏃",
  "🧹",
  "💊",
  "✍️",
  "🎨",
  "🎯",
  "🧠",
  "🍎",
  "🛌",
  "🚿",
  "🎵",
  "☎️",
  "💼",
];
const TZ_LIST = [
  "UTC",
  "Africa/Lagos",
  "Africa/Niamey",
  "Africa/Cairo",
  "Africa/Nairobi",
  "Africa/Johannesburg",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Jakarta",
  "Australia/Sydney",
];

const $ = (id) => document.getElementById(id);

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2400);
}

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABELS = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};
let selectedDays = new Set(DAYS); // default: every day

function todayKey() {
  // JS getDay(): 0=Sun..6=Sat -> map to our mon-first keys
  const idx = new Date().getDay();
  return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][idx];
}

function renderDayPicker(days) {
  selectedDays = new Set(days && days.length ? days : DAYS);
  document.querySelectorAll(".day-chip").forEach((chip) => {
    chip.classList.toggle("active", selectedDays.has(chip.dataset.day));
  });
}

// ------------------------------------------------------------------
// Init
// ------------------------------------------------------------------
(async function init() {
  supabase = await getSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = "index.html";
    return;
  }
  user = session.user;

  await loadProfile();
  renderWeekStrip();
  renderTimezoneOptions();
  await loadTasks();
  bindEvents();
})();

async function loadProfile() {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (error) {
    console.error(error);
    return;
  }
  profile = data;
  $("userName").textContent = profile.full_name || "there";
  $("avatarBtn").textContent = profile.avatar_emoji || "🐯";
  $("todayLabel").textContent = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function renderWeekStrip() {
  const strip = $("weekStrip");
  strip.innerHTML = "";
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);

  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const isToday = d.toDateString() === now.toDateString();
    const col = document.createElement("div");
    col.className = "day-col" + (isToday ? " today" : "");
    col.innerHTML = `<span class="dow">${labels[i]}</span><span class="dnum">${d.getDate()}</span>`;
    strip.appendChild(col);
  }
}

function renderTimezoneOptions() {
  const sel = $("settingsTimezone");
  sel.innerHTML = TZ_LIST.map(
    (tz) => `<option value="${tz}">${tz}</option>`,
  ).join("");
}

// ------------------------------------------------------------------
// Load tasks + today's completion + active item
// ------------------------------------------------------------------
async function loadTasks() {
  const listEl = $("taskList");
  listEl.innerHTML = '<div class="empty-state">Loading your routine…</div>';

  const { data: taskRows, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error) {
    console.error(error);
    listEl.innerHTML = '<div class="empty-state">Could not load tasks.</div>';
    return;
  }

  const today = todayISO();
  const { data: completions } = await supabase
    .from("task_completions")
    .select("task_id, item_label")
    .eq("user_id", user.id)
    .eq("log_date", today);

  const completedMap = {};
  (completions || []).forEach((c) => (completedMap[c.task_id] = c.item_label));

  const { data: activeItems } = await supabase
    .from("task_items")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "active");

  const activeItemMap = {};
  (activeItems || []).forEach((it) => (activeItemMap[it.task_id] = it));

  const todayDay = todayKey();
  tasks = taskRows
    .map((t) => ({
      ...t,
      completedToday: completedMap.hasOwnProperty(t.id),
      activeItem: activeItemMap[t.id] || null,
    }))
    .filter((t) => !t.active_days || t.active_days.includes(todayDay));

  renderTasks();
}

function renderTasks() {
  const listEl = $("taskList");
  if (!tasks.length) {
    listEl.innerHTML = `<div class="empty-state"><span class="emo">🌤️</span>No goals yet. Tap + to add your first routine.</div>`;
    return;
  }

  listEl.innerHTML = "";
  tasks.forEach((t) => {
    const row = document.createElement("div");
    row.className = "task-row";

    const subtitle =
      t.type === "alternating"
        ? t.activeItem
          ? `Now: ${t.activeItem.label} · Streak ${t.current_streak}d`
          : `All items done · Streak ${t.current_streak}d`
        : `Streak ${t.current_streak} day${t.current_streak === 1 ? "" : "s"}`;

    const scheduleTag =
      t.active_days && t.active_days.length < 7
        ? ` · ${t.active_days.map((d) => DAY_LABELS[d]).join(" ")}`
        : "";

    row.innerHTML = `
      <div class="check-dot ${t.completedToday ? "done" : ""}" data-id="${t.id}">${t.completedToday ? "✓" : ""}</div>
      <div class="task-card ${t.completedToday ? "completed" : ""}">
        <div class="task-icon" style="background:${t.color || "#f7c9a0"}">${t.icon || "✅"}</div>
        <div class="task-info">
          <p class="t-title">${escapeHtml(t.title)}</p>
          <p class="t-sub">${escapeHtml(subtitle)}</p>
        </div>
        <div class="task-time">
          <span>🕐</span>
          <span>${t.duration_minutes || 0} min</span>
        </div>
        <div class="task-actions">
          <button class="icon-btn" data-edit="${t.id}">✎</button>
          <button class="icon-btn" data-del="${t.id}">🗑</button>
        </div>
      </div>
    `;
    listEl.appendChild(row);
  });
}

function escapeHtml(s) {
  return (s || "").replace(
    /[&<>"']/g,
    (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        m
      ],
  );
}

// ------------------------------------------------------------------
// Mark task done / undo
// ------------------------------------------------------------------
async function toggleComplete(taskId) {
  const t = tasks.find((x) => x.id === taskId);
  if (!t) return;
  const today = todayISO();

  if (t.completedToday) {
    // undo
    await supabase
      .from("task_completions")
      .delete()
      .eq("task_id", taskId)
      .eq("log_date", today);
    const newStreak = Math.max(0, (t.current_streak || 1) - 1);
    await supabase
      .from("tasks")
      .update({ current_streak: newStreak })
      .eq("id", taskId);
    await loadTasks();
    return;
  }

  // compute new streak
  let newStreak = 1;
  if (t.last_completed_date) {
    const last = new Date(t.last_completed_date);
    const diffDays = Math.round((new Date(today) - last) / 86400000);
    if (diffDays === 1) newStreak = (t.current_streak || 0) + 1;
    else if (diffDays === 0) newStreak = t.current_streak || 1;
  }
  const longest = Math.max(t.longest_streak || 0, newStreak);

  const itemLabel = t.activeItem ? t.activeItem.label : null;

  const { error: insErr } = await supabase.from("task_completions").insert({
    task_id: taskId,
    user_id: user.id,
    log_date: today,
    item_label: itemLabel,
  });
  if (insErr) {
    toast("Could not save — try again.");
    return;
  }

  await supabase
    .from("tasks")
    .update({
      current_streak: newStreak,
      longest_streak: longest,
      last_completed_date: today,
    })
    .eq("id", taskId);

  // advance alternating queue
  if (t.type === "alternating" && t.activeItem) {
    await supabase
      .from("task_items")
      .update({ status: "done" })
      .eq("id", t.activeItem.id);
    const { data: nextItem } = await supabase
      .from("task_items")
      .select("*")
      .eq("task_id", taskId)
      .eq("status", "pending")
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (nextItem) {
      await supabase
        .from("task_items")
        .update({ status: "active" })
        .eq("id", nextItem.id);
    } else {
      toast(
        `You finished your list for "${t.title}" 🎉 Add more items any time.`,
      );
    }
  }

  toast("Nice work! ✓");
  await loadTasks();
}

async function deleteTask(taskId) {
  if (!confirm("Delete this goal? This removes its history too.")) return;
  await supabase.from("tasks").delete().eq("id", taskId);
  await loadTasks();
}

// ------------------------------------------------------------------
// Add / edit task modal
// ------------------------------------------------------------------
function openTaskModal(task = null) {
  editingTaskId = task ? task.id : null;
  currentType = task ? task.type : "simple";
  $("modalTitle").textContent = task ? "Edit goal" : "New goal";
  $("taskTitle").value = task ? task.title : "";
  $("taskDuration").value = task ? task.duration_minutes : 10;
  $("taskReminder").value = task
    ? (task.reminder_time || "08:00").slice(0, 5)
    : "08:00";
  setType(currentType);
  renderEmojiRow(task ? task.icon : EMOJIS[0]);
  renderDayPicker(task ? task.active_days : DAYS.slice());

  $("itemsList").innerHTML = "";
  itemCounter = 0;
  if (task && task.type === "alternating") {
    loadItemsForEdit(task.id);
  } else if (currentType === "alternating") {
    addItemRow("");
  }

  $("taskModalOverlay").style.display = "flex";
}

async function loadItemsForEdit(taskId) {
  const { data } = await supabase
    .from("task_items")
    .select("*")
    .eq("task_id", taskId)
    .order("position");
  (data || []).forEach((it) => addItemRow(it.label));
  if (!data || !data.length) addItemRow("");
}

function closeTaskModal() {
  $("taskModalOverlay").style.display = "none";
  editingTaskId = null;
}

function setType(type) {
  currentType = type;
  $("typeSimpleBtn").classList.toggle("active", type === "simple");
  $("typeAltBtn").classList.toggle("active", type === "alternating");
  $("altItemsSection").style.display =
    type === "alternating" ? "block" : "none";
  $("titleLabel").textContent =
    type === "alternating" ? "Goal name (e.g. Reading list)" : "Title";
  if (type === "alternating" && $("itemsList").children.length === 0)
    addItemRow("");
}

function renderEmojiRow(selected) {
  const row = $("emojiRow");
  row.innerHTML = "";
  EMOJIS.forEach((e) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "emoji-choice" + (e === selected ? " active" : "");
    btn.textContent = e;
    btn.dataset.emoji = e;
    btn.addEventListener("click", () => {
      [...row.children].forEach((c) => c.classList.remove("active"));
      btn.classList.add("active");
    });
    row.appendChild(btn);
  });
  if (!selected) row.firstChild.classList.add("active");
}

function addItemRow(value) {
  itemCounter++;
  const wrap = document.createElement("div");
  wrap.className = "item-row";
  wrap.innerHTML = `
    <input type="text" placeholder="e.g. Atomic Habits" value="${escapeHtml(value || "")}">
    <button type="button" title="Remove">✕</button>
  `;
  wrap.querySelector("button").addEventListener("click", () => wrap.remove());
  $("itemsList").appendChild(wrap);
}

async function saveTask() {
  const title = $("taskTitle").value.trim();
  if (!title) {
    toast("Give your goal a title first.");
    return;
  }

  const selectedEmojiBtn = document.querySelector(".emoji-choice.active");
  const icon = selectedEmojiBtn ? selectedEmojiBtn.dataset.emoji : EMOJIS[0];
  const duration = parseInt($("taskDuration").value, 10) || 0;
  const reminderTime = $("taskReminder").value || null;

  const payload = {
    title,
    icon,
    duration_minutes: duration,
    reminder_time: reminderTime,
    type: currentType,
    user_id: user.id,
    is_active: true,
    active_days: selectedDays.size
      ? DAYS.filter((d) => selectedDays.has(d))
      : DAYS,
  };

  let taskId = editingTaskId;

  if (editingTaskId) {
    await supabase.from("tasks").update(payload).eq("id", editingTaskId);
  } else {
    const { data, error } = await supabase
      .from("tasks")
      .insert(payload)
      .select()
      .single();
    if (error) {
      toast("Could not save goal.");
      return;
    }
    taskId = data.id;
  }

  if (currentType === "alternating") {
    const labels = [...document.querySelectorAll("#itemsList input")]
      .map((i) => i.value.trim())
      .filter(Boolean);

    if (editingTaskId) {
      // Only add NEW items beyond what already exists; keep existing rotation intact.
      const { data: existing } = await supabase
        .from("task_items")
        .select("label")
        .eq("task_id", taskId);
      const existingLabels = new Set((existing || []).map((e) => e.label));
      const newLabels = labels.filter((l) => !existingLabels.has(l));
      await insertItems(taskId, newLabels, existing ? existing.length : 0);
    } else {
      await insertItems(taskId, labels, 0);
    }
  }

  closeTaskModal();
  toast("Goal saved.");
  await loadTasks();
}

async function insertItems(taskId, labels, startPosition) {
  if (!labels.length) return;
  const { data: activeExisting } = await supabase
    .from("task_items")
    .select("id")
    .eq("task_id", taskId)
    .eq("status", "active")
    .maybeSingle();

  const rows = labels.map((label, idx) => ({
    task_id: taskId,
    user_id: user.id,
    label,
    position: startPosition + idx,
    status: !activeExisting && idx === 0 ? "active" : "pending",
  }));
  await supabase.from("task_items").insert(rows);
}

// ------------------------------------------------------------------
// Settings modal
// ------------------------------------------------------------------
function openSettings() {
  $("settingsName").value = profile.full_name || "";
  $("settingsTimezone").value = profile.timezone || "UTC";
  $("settingsReminders").value = String(profile.reminders_enabled !== false);
  $("settingsModalOverlay").style.display = "flex";
}

async function saveSettings() {
  const full_name = $("settingsName").value.trim();
  const timezone = $("settingsTimezone").value;
  const reminders_enabled = $("settingsReminders").value === "true";

  await supabase
    .from("profiles")
    .update({ full_name, timezone, reminders_enabled })
    .eq("id", user.id);
  profile = { ...profile, full_name, timezone, reminders_enabled };
  $("userName").textContent = full_name || "there";
  $("settingsModalOverlay").style.display = "none";
  toast("Settings saved.");
}

// ------------------------------------------------------------------
// Events
// ------------------------------------------------------------------
function bindEvents() {
  $("addTaskBtn").addEventListener("click", () => openTaskModal(null));
  $("reminderSetupBtn").addEventListener("click", () => openTaskModal(null));
  $("cancelModalBtn").addEventListener("click", closeTaskModal);
  $("saveTaskBtn").addEventListener("click", saveTask);
  $("typeSimpleBtn").addEventListener("click", () => setType("simple"));
  $("typeAltBtn").addEventListener("click", () => setType("alternating"));
  $("addItemBtn").addEventListener("click", () => addItemRow(""));

  $("settingsBtn").addEventListener("click", openSettings);
  $("avatarBtn").addEventListener("click", openSettings);
  $("closeSettingsBtn").addEventListener(
    "click",
    () => ($("settingsModalOverlay").style.display = "none"),
  );
  $("saveSettingsBtn").addEventListener("click", saveSettings);

  $("seeAllBtn").addEventListener("click", () => {
    document.getElementById("taskList").scrollIntoView({ behavior: "smooth" });
  });

  $("logoutBtn").addEventListener("click", async () => {
    await supabase.auth.signOut();
    window.location.href = "index.html";
  });

  $("taskList").addEventListener("click", (e) => {
    const dot = e.target.closest(".check-dot");
    if (dot) {
      toggleComplete(dot.dataset.id);
      return;
    }
    const editBtn = e.target.closest("[data-edit]");
    if (editBtn) {
      const t = tasks.find((x) => x.id === editBtn.dataset.edit);
      if (t) openTaskModal(t);
      return;
    }
    const delBtn = e.target.closest("[data-del]");
    if (delBtn) {
      deleteTask(delBtn.dataset.del);
      return;
    }
  });

  document.querySelectorAll(".day-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const d = chip.dataset.day;
      if (selectedDays.has(d)) selectedDays.delete(d);
      else selectedDays.add(d);
      chip.classList.toggle("active");
    });
  });

  $("allDaysBtn").addEventListener("click", () =>
    renderDayPicker(DAYS.slice()),
  );

  // close modals on backdrop click
  [$("taskModalOverlay"), $("settingsModalOverlay")].forEach((ov) => {
    ov.addEventListener("click", (e) => {
      if (e.target === ov) ov.style.display = "none";
    });
  });
}
