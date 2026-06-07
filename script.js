const form = document.querySelector("#rsvp-form");
const statusEl = document.querySelector("#form-status");
const countPanel = document.querySelector("#count-panel");
const guestCountEl = document.querySelector("#guest-count");
const groupCountEl = document.querySelector("#group-count");
const attendanceCountEl = document.querySelector("#attendance-count");
const adminSection = document.querySelector("#admin-section");
const adminRows = document.querySelector("#admin-rows");

const params = new URLSearchParams(window.location.search);
const adminSecret = params.get("admin");

const attendanceLabels = {
  "full-evening": "Hele avond",
  "walking-dinner": "Walking dinner",
  "party-only": "Alleen feest",
  "not-coming": "Komt niet"
};

function formatGuestCount(stats) {
  const people = Number(stats.totalPeople || 0);
  const groups = Number(stats.totalGroups || 0);
  const declinedGroups = Number(stats.declinedGroups || 0);
  guestCountEl.textContent = `${people} ${people === 1 ? "gast" : "gasten"} aanwezig`;
  groupCountEl.textContent =
    `${groups} ${groups === 1 ? "aanmelding die komt" : "aanmeldingen die komen"}` +
    (declinedGroups ? `, ${declinedGroups} ${declinedGroups === 1 ? "afmelding" : "afmeldingen"}` : "");
  attendanceCountEl.textContent =
    `${Number(stats.dinnerPeople || 0)} walking dinner, ${Number(stats.partyPeople || 0)} feest` +
    (stats.declinedPeople ? `, ${Number(stats.declinedPeople)} niet aanwezig` : "");
}

function renderAdmin(entries = []) {
  if (!adminSecret) return;

  adminSection.hidden = false;
  adminRows.innerHTML = "";

  if (!entries.length) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="4">Nog geen reacties.</td>`;
    adminRows.append(row);
    return;
  }

  entries.forEach((entry) => {
    const row = document.createElement("tr");
    const date = new Date(entry.createdAt);
    const names = Array.isArray(entry.names) ? entry.names.join(", ") : "";
    const attendance = attendanceLabels[entry.attendance] || "Hele avond";
    row.innerHTML = `
      <td>${Number.isNaN(date.valueOf()) ? "" : date.toLocaleString("nl-NL")}</td>
      <td>${escapeHtml(names)}</td>
      <td>${escapeHtml(attendance)}</td>
      <td>${escapeHtml(entry.note || "")}</td>
    `;
    adminRows.append(row);
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadStats() {
  if (!adminSecret) {
    countPanel.hidden = true;
    return;
  }

  countPanel.hidden = false;

  try {
    const response = await fetch(`/api/rsvp?admin=${encodeURIComponent(adminSecret)}`);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.message || "Aanmeldingen konden niet worden geladen.");
    }

    formatGuestCount(payload.stats);
    renderAdmin(payload.entries);
  } catch (error) {
    guestCountEl.textContent = "Teller nog niet beschikbaar";
    groupCountEl.textContent = "";
    attendanceCountEl.textContent = "";
    if (adminSecret) {
      adminSection.hidden = false;
      adminRows.innerHTML = `<tr><td colspan="4">${escapeHtml(error.message)}</td></tr>`;
    }
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const names = [formData.get("name1"), formData.get("name2")]
    .map((name) => String(name || "").trim())
    .filter(Boolean);
  const attendance = String(formData.get("attendance") || "");

  if (names.length === 0) {
    statusEl.textContent = "Vul minimaal een naam in.";
    return;
  }

  if (!attendance) {
    statusEl.textContent = "Kies of jullie erbij zijn.";
    return;
  }

  const submitButton = form.querySelector("button[type='submit']");
  submitButton.disabled = true;
  statusEl.textContent = "Aanmelding versturen...";

  try {
    const response = await fetch("/api/rsvp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        names,
        attendance,
        note: String(formData.get("note") || "").trim(),
        website: String(formData.get("website") || "")
      })
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.message || "Aanmelden lukte niet.");
    }

    form.reset();
    statusEl.textContent = "Dank je, jullie reactie is binnen.";
    if (adminSecret) {
      await loadStats();
    }
  } catch (error) {
    statusEl.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
});

loadStats();
