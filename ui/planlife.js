// planlife.js - the extra Focus tabs (skills/planlife.py on the Python side): a drag-and-drop 📅 week calendar,
// 🌳 goal tree, ✈️ travel planner and ⏱️ screen time. focus.js draws one of these into its view.
import { el, toast, busy } from "./util.js";

const peso = (n, cur = "PHP") => `${cur === "PHP" ? "₱" : cur === "USD" ? "$" : cur + " "}${Math.round(Number(n) || 0).toLocaleString()}`;

// ---------------- 🌳 goal tree ----------------
export async function drawGoals(view, api) {
  const render = (goals) => {
    const node = (g) => el("li", { class: g.done ? "done" : "" },
      el("div", { class: "goal-row" },
        el("input", { type: "checkbox", checked: g.progress >= 1, "aria-label": `Done: ${g.title}`, onchange: async () => render((await api.goal_toggle(g.id)).goals) }),
        el("span", { class: "goal-title" }, g.title),
        el("span", { class: "goal-bar", style: `--p:${g.progress * 100}` }, el("i")), el("small", {}, `${Math.round(g.progress * 100)}%`),
        el("button", { class: "ghost small", onclick: () => ask(g) }, "+ step"),
        el("button", { class: "ghost small danger", "aria-label": `Remove ${g.title}`, onclick: async () => render((await api.goal_remove(g.id)).goals) }, "✕")),
      g.children.length ? el("ul", {}, g.children.map(node)) : null);
    const input = el("input", { placeholder: "A big goal (e.g. Pass the board exam)", "aria-label": "New goal" });
    view.replaceChildren(
      el("form", { class: "row", onsubmit: async (e) => { e.preventDefault(); const r = await api.goal_add(input.value, null); if (r.error) return toast(r.error); render(r.goals); } },
        input, el("button", { class: "primary" }, "Add goal")),
      goals.length ? el("ul", { class: "goal-tree" }, goals.map(node)) : el("p", { class: "none" }, "No goals yet. Add a big one, then break it into sub-goals and small steps."));
  };
  const ask = async (g) => {
    const t = prompt(`A smaller step for “${g.title}”:`);
    if (!t) return;
    const r = await api.goal_add(t, g.id);
    if (r.error) return toast(r.error);
    render(r.goals);
  };
  render((await api.goal_tree()).goals);
}

// ---------------- ⏱️ screen time ----------------
export async function drawScreen(view, api) {
  const x = await api.focus_extras();
  const s = x.screen, wk = x.screen_week;
  const top = Math.max(1, ...s.apps.map((a) => a.minutes));
  const wtop = Math.max(1, ...wk.map((d) => d.minutes));
  const hm = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);
  view.replaceChildren(
    el("h4", {}, `Today · ${hm(s.total)}`),
    s.apps.length ? el("ul", { class: "st-list" }, s.apps.map((a) => el("li", {}, el("span", {}, a.app), el("i", { style: `--p:${a.minutes / top * 100}` }), el("b", {}, hm(a.minutes)))))
      : el("p", { class: "none" }, "Nothing yet today. Vermeil counts the app in front every 30 seconds (not while you're away)."),
    el("h4", {}, "This week"),
    el("div", { class: "st-week" }, wk.map((d) => el("div", { title: `${d.date}: ${hm(d.minutes)}` }, el("i", { style: `--p:${d.minutes / wtop * 100}` }), el("small", {}, d.date.slice(8))))),
    el("p", { class: "note" }, "Turn it off in Settings → Companion life (Count my screen time). It stays on this PC."));
}

// ---------------- ✈️ travel planner ----------------
export async function drawTravel(view, api, onCalendar = null) {
  const f = {
    place: el("input", { placeholder: "Where? (e.g. Cebu, Tokyo)", "aria-label": "Place", required: true }),
    days: el("input", { type: "number", min: 1, max: 14, placeholder: "Days", "aria-label": "Number of days", required: true }),
    origin: el("input", { placeholder: "Flying from (optional)", "aria-label": "Flying from" }),
    start: el("input", { type: "date", "aria-label": "Start date" }),
    people: el("input", { type: "number", min: 1, max: 12, value: 1, "aria-label": "People" }),
    budget: el("input", { placeholder: "Budget (optional)", "aria-label": "Budget" }),
    currency: el("select", { "aria-label": "Currency" }, ["PHP", "USD", "JPY", "KRW", "EUR", "SGD"].map((c) => el("option", { value: c }, c))),
    stars: el("input", { type: "range", min: 1, max: 5, value: 3, "aria-label": "Price level" }),
  };
  const words = ["", "Super cheap", "Cheap", "Average", "Comfortable", "Expensive"];
  const starLabel = el("b", {}, "★★★ Average");
  f.stars.addEventListener("input", () => { starLabel.textContent = `${"★".repeat(f.stars.value)} ${words[f.stars.value]}`; });
  const out = el("div");
  const go = el("button", { class: "primary" }, "✈️ Plan my trip");
  const req = () => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.value]));
  view.replaceChildren(
    el("form", { class: "travel-form", onsubmit: async (e) => {
      e.preventDefault();
      if (!f.place.value.trim() || !f.days.value) return toast("Type the place and how many days first.");
      busy(go, true, "Planning…");
      const p = await api.travel_plan(req());
      busy(go, false);
      if (p.error) return toast(p.error);
      showPlan(out, api, p, onCalendar);
    } },
      f.place, f.days, f.origin, f.start, f.people, f.budget, f.currency,
      el("label", { class: "inline" }, "Price ", f.stars, starLabel), go),
    out);
  const saved = await api.travel_saved();
  if (saved.length) out.replaceChildren(el("h5", {}, "Saved plans"), ...saved.map((p) =>
    el("button", { class: "ghost small", onclick: () => showPlan(out, api, p, onCalendar) }, `${p.request.place} · ${p.request.days} days`)));
}

/** "Put it on your calendar?" - every trip day becomes a calendar event with that day's itinerary */
function calendarAsk(api, plan, onCalendar) {
  const start = el("input", { type: "date", "aria-label": "First day of the trip", value: plan.request.start || "" });
  const box = el("div", { class: "edit-card trip-cal" },
    el("b", {}, "📅 Add this trip to your calendar?"),
    el("p", { class: "note" }, "Each day of the trip goes on the calendar, with that day's itinerary."),
    el("div", { class: "row" }, el("label", { class: "inline" }, "First day ", start),
      el("button", { class: "primary small", onclick: async (e) => {
        if (!start.value) return toast("Pick the first day of the trip.");
        busy(e.currentTarget, true, "Adding…");
        const r = await api.travel_to_calendar(plan, start.value);
        if (r.error) { busy(e.currentTarget, false); return toast(r.error); }
        toast(r.message, 7000);
        onCalendar?.(r.start);                                     // the planner shows the trip and starts the form over
      } }, "Yes, add it"),
      el("button", { class: "ghost small", onclick: () => box.remove() }, "Not now")));
  return box;
}

/** A real site, shown in the app's own Browser panel */
function openSite(api, label, url, kind = "ghost") {
  return el("button", { type: "button", class: `${kind} small`, title: url, onclick: async () => {
    const r = await api.browse_inside(url, null);
    if (r?.error) toast(r.error, 6000);
  } }, label);
}

function showPlan(out, api, plan, onCalendar = null) {
  const cur = plan.request.currency;
  const redraw = (p) => { if (p.error) return toast(p.error); plan = p; showPlan(out, api, p, onCalendar); };
  const a = plan.airfare || {};
  out.replaceChildren(
    el("h4", {}, `${plan.request.place} · ${plan.request.days} days · ${"★".repeat(plan.request.stars)}`),
    calendarAsk(api, plan, onCalendar),
    plan.summary ? el("p", {}, plan.summary) : null,
    el("p", { class: "note" }, `Estimated total: ${peso(plan.estimate, cur)} per person. These are the AI's rough guesses. The real prices and times are on the sites below.`),
    el("h5", {}, "✈️ Flights"),
    a.route ? el("p", { class: "note" }, `${a.route}: roughly ${peso(a.low, cur)} – ${peso(a.high, cur)} (a guess, not a live fare)${a.tip ? ". " + a.tip : ""}`) : null,
    plan.links?.flights?.length ? el("div", { class: "row travel-sites" }, plan.links.flights.map((s) => openSite(api, s.name, s.url))) : null,
    plan.links?.flights?.length ? el("p", { class: "note" }, `Real schedules and fares are on the airline's own site. Type in ${[plan.request.origin, plan.request.place].filter(Boolean).join(" to ")}${plan.request.start ? ` on ${plan.request.start}` : ""} there.`) : null,
    el("h5", {}, "🏠 Where to stay"),
    plan.links?.airbnb ? el("div", { class: "row travel-sites" }, openSite(api, `Search Airbnb in ${plan.request.place}`, plan.links.airbnb, "primary")) : null,
    el("div", { class: "stay-list" }, (plan.stays || []).map((s) => el("div", { class: "stay" },
      el("div", { class: "stay-top" }, el("b", {}, s.name || s.area || "A good area"), el("span", { class: "stay-price" }, `about ${peso(s.per_night, cur)}/night`)),
      s.name && s.area ? el("small", { class: "note" }, s.area) : null,
      s.why ? el("p", {}, s.why) : null,
      s.link ? openSite(api, "See real places here on Airbnb", s.link) : null))),
    ...(plan.days || []).map((d) => el("div", { class: "trip-day" },
      el("h5", {}, `Day ${d.day}: ${d.title || ""} · ${peso(d.total, cur)}`),
      el("ol", {}, d.stops.map((s, i) => el("li", { class: `stop ${s.kind}` },
        el("span", {}, `${s.time || ""} ${s.kind === "commute" ? "🚌" : s.kind === "food" ? "🍽️" : s.kind === "hotel" ? "🏨" : "📍"} `),
        el("b", {}, s.name), s.area ? ` · ${s.area}` : "", ` · ${peso(s.cost, cur)}`, s.note ? el("small", { class: "note" }, ` ${s.note}`) : null,
        el("button", { class: "ghost small", title: "Suggest a different place", onclick: async (e) => {
          const why = prompt("Why change it? (optional, e.g. too far, I've been there)") ?? "";
          busy(e.currentTarget, true, "…");
          redraw(await api.travel_swap(plan, d.day, i, why));
        } }, "🔄"),
        el("button", { class: "ghost small", title: "Type your own", onclick: async () => {
          const name = prompt("Your place:", s.name);
          if (!name) return;
          const cost = prompt("Cost:", s.cost);
          redraw(await api.travel_edit(plan, d.day, i, { ...s, name, cost }));
        } }, "✏️"))),
        el("li", {}, el("button", { class: "ghost small", onclick: async () => {
          const name = prompt("Add a place to this day:");
          if (!name) return;
          redraw(await api.travel_edit(plan, d.day, d.stops.length, { name, kind: "spot", cost: 0 }));
        } }, "+ Add a place"))))),
    plan.tips?.length ? el("ul", { class: "note" }, plan.tips.map((t) => el("li", {}, t))) : null);
}
