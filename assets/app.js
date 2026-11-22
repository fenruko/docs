/* Rift Docs: renders the command catalogue served by the bot itself.
 *
 * Source of truth: GET https://api.rift.cool/api/public/commands (schema_version 1).
 * Nothing here lists commands by hand. A command added to the bot appears on
 * this page after the bot restarts; the browser revalidates the response via
 * its ETag, and the last good copy is cached so the page still works offline.
 */
(() => {
  "use strict";

  const API_URL = "https://api.rift.cool/api/public/commands";
  const CACHE_KEY = "rift-docs-commands-v1";
  const SUPPORTED_SCHEMA = 1;
  const PREFIX = "!";

  const $ = (sel, root = document) => root.querySelector(sel);
  const content = $("#content");
  const catsNav = $("#cats");
  const input = $("#q");
  const state = { data: null, kind: "all", query: "", spy: null };

  /* ---------- tiny DOM helper (text only: API data is never parsed as HTML) ---------- */
  function el(tag, props, ...kids) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props || {})) {
      if (value == null || value === false) continue;
      if (key === "class") node.className = value;
      else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? "" : value);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return node;
  }

  /* ---------- data ---------- */
  function readCache() {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      return cached && cached.data && cached.data.schema_version === SUPPORTED_SCHEMA ? cached : null;
    } catch {
      return null;
    }
  }

  function writeCache(data) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data }));
    } catch {
      /* private mode or full: the page works without a cache */
    }
  }

  async function fetchCatalog() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(API_URL, { signal: controller.signal, headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`The bot answered ${response.status}`);
      const data = await response.json();
      if (!data || data.schema_version !== SUPPORTED_SCHEMA || !Array.isArray(data.categories)) {
        throw new Error("The bot sent a command list in a format this page doesn't understand yet.");
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  /* ---------- formatting ---------- */
  function usageFor(cmd, kind) {
    const lead = kind === "slash" ? "/" : PREFIX;
    const parts = [lead + cmd.path];
    if (cmd.type === "group") {
      parts.push("<subcommand>");
    } else {
      for (const p of cmd.parameters || []) parts.push(p.required ? `<${p.name}>` : `[${p.name}]`);
    }
    return parts.join(" ");
  }

  function relTime(iso) {
    const t = Date.parse(iso);
    if (!t) return "";
    const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (mins < 2) return "just now";
    if (mins < 60) return `${mins} minutes ago`;
    const hours = Math.round(mins / 60);
    if (hours < 36) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    return `${Math.round(hours / 24)} days ago`;
  }

  const fmt = (n) => Number(n || 0).toLocaleString("en-US");

  /* ---------- filtering ---------- */
  function tokens(query) {
    return query.toLowerCase().split(/\s+/).filter(Boolean);
  }

  function haystack(cmd) {
    return `${cmd.path} ${(cmd.aliases || []).join(" ")} ${cmd.description || ""}`.toLowerCase();
  }

  function hasKind(cmd, kind) {
    return kind === "all" || (cmd.kinds || []).includes(kind);
  }

  /** Returns a pruned copy of `cmd`, or null when nothing in it matches. */
  function prune(cmd, toks, kind) {
    const selfMatch = toks.every((t) => haystack(cmd).includes(t));
    if (cmd.type === "group" && cmd.subcommands.length) {
      const kept = cmd.subcommands.map((s) => prune(s, selfMatch ? [] : toks, kind)).filter(Boolean);
      if (!kept.length) return null;
      return { ...cmd, subcommands: kept };
    }
    return selfMatch && hasKind(cmd, kind) ? cmd : null;
  }

  function countLeaves(cmds) {
    let n = 0;
    for (const c of cmds) n += c.type === "group" && c.subcommands.length ? countLeaves(c.subcommands) : 1;
    return n;
  }

  function filtered() {
    const toks = tokens(state.query);
    const out = [];
    for (const cat of state.data.categories) {
      const catMatch = toks.length > 0 && toks.every((t) => cat.name.toLowerCase().includes(t));
      const cmds = cat.commands.map((c) => prune(c, catMatch ? [] : toks, state.kind)).filter(Boolean);
      if (cmds.length) out.push({ ...cat, commands: cmds, shown: countLeaves(cmds) });
    }
    return out;
  }

  /* ---------- rendering ---------- */
  function highlight(text, toks) {
    if (!toks.length || !text) return text;
    const safe = toks.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const parts = String(text).split(new RegExp(`(${safe.join("|")})`, "ig"));
    return parts.map((part, i) => (i % 2 ? el("mark", null, part) : part));
  }

  function usageRow(text) {
    const btn = el("button", { class: "copy", type: "button", "aria-label": `Copy ${text}` }, "Copy");
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = "Copied";
      } catch {
        btn.textContent = "Press Ctrl+C";
      }
      setTimeout(() => (btn.textContent = "Copy"), 1400);
    });
    return el("div", { class: "usage-row" }, el("code", null, text), btn);
  }

  function buildBody(cmd, toks) {
    const body = el("div", { class: "body" });
    const kinds = (cmd.kinds || []).filter((k) => state.kind === "all" || k === state.kind);
    const usage = el("div", { class: "usage" });
    for (const kind of kinds.length ? kinds : cmd.kinds || []) usage.append(usageRow(usageFor(cmd, kind)));
    body.append(usage);

    const meta = el("div", { class: "meta-row" });
    if (cmd.aliases && cmd.aliases.length) meta.append(el("span", null, "Aliases: ", cmd.aliases.map((a, i) => [i ? " " : "", el("code", null, a)])));
    if (cmd.permissions && cmd.permissions.length) meta.append(el("span", null, "Needs: ", cmd.permissions.map((p, i) => [i ? " " : "", el("code", null, p.replace(/_/g, " "))])));
    if (meta.childNodes.length) body.append(meta);

    if (cmd.parameters && cmd.parameters.length) {
      const rows = cmd.parameters.map((p) =>
        el(
          "tr",
          null,
          el("td", null, el("code", null, p.name)),
          el("td", null, p.type || "text"),
          el("td", null, p.required ? el("span", { class: "req" }, "required") : p.default !== undefined ? `default ${p.default}` : "optional"),
          el("td", null, p.description || "")
        )
      );
      body.append(
        el("table", { class: "params" }, el("thead", null, el("tr", null, el("th", null, "Option"), el("th", null, "Type"), el("th", null, ""), el("th", null, "Description"))), el("tbody", null, rows))
      );
    }

    if (cmd.type === "group" && cmd.subcommands.length) {
      body.append(el("p", { class: "subs-title" }, `${countLeaves(cmd.subcommands)} subcommands`), el("div", { class: "subs" }, cmd.subcommands.map((s) => renderCmd(s, toks, true))));
    }
    return body;
  }

  function renderCmd(cmd, toks, nested = false) {
    const isGroup = cmd.type === "group" && cmd.subcommands.length;
    const lead = (cmd.kinds || []).length === 1 && cmd.kinds[0] === "slash" ? "/" : PREFIX;
    const tags = el(
      "span",
      { class: "tags" },
      isGroup && el("span", { class: "tag group" }, "group"),
      (cmd.kinds || []).includes("slash") && el("span", { class: "tag slash" }, "slash"),
      (cmd.kinds || []).includes("prefix") && el("span", { class: "tag" }, "prefix")
    );
    const details = el(
      "details",
      { class: "cmd", id: nested ? null : `c-${cmd.path.replace(/\s+/g, "-")}`, "data-path": cmd.path },
      el("summary", null, el("span", { class: "name" }, highlight(lead + cmd.path, toks)), el("span", { class: "desc" }, highlight(cmd.description || "", toks)), tags)
    );
    // Build the heavy part only when opened: keeps ~800 commands cheap.
    const fill = () => {
      if (!details.querySelector(":scope > .body")) details.append(buildBody(cmd, toks));
    };
    details.addEventListener("toggle", () => details.open && fill());
    if (toks.length && isGroup) details.open = true;
    if (details.open) fill();
    return details;
  }

  function renderSidebar(cats) {
    catsNav.replaceChildren(
      ...cats.map((c) => el("a", { href: `#${c.id}`, "data-cat": c.id }, el("b", { style: "font-weight:500" }, c.name), el("span", null, c.shown)))
    );
  }

  function renderStats() {
    const s = state.data.stats || {};
    const values = [s.commands, s.categories, s.slash, s.prefix];
    document.querySelectorAll("#stats li b").forEach((node, i) => (node.textContent = fmt(values[i])));
    const when = relTime(state.data.generated_at);
    $("#meta").textContent = when ? `Last refreshed ${when}.` : "";
  }

  function render() {
    const cats = filtered();
    const toks = tokens(state.query);
    renderSidebar(cats);
    content.setAttribute("aria-busy", "false");

    if (!cats.length) {
      content.replaceChildren(
        el("div", { class: "empty" }, el("h3", null, "No commands found"), el("p", null, state.query ? `Nothing matches “${state.query}”${state.kind !== "all" ? ` in ${state.kind} commands` : ""}.` : "There are no commands to show."))
      );
      return;
    }

    content.replaceChildren(
      ...cats.map((cat) =>
        el(
          "section",
          { class: "cat", id: cat.id },
          el("div", { class: "cat-head" }, el("h2", null, el("a", { href: `#${cat.id}` }, highlight(cat.name, toks))), el("span", { class: "count" }, `${cat.shown} command${cat.shown === 1 ? "" : "s"}`)),
          cat.description ? el("p", { class: "cat-desc" }, cat.description) : null,
          el("div", { class: "list" }, cat.commands.map((c) => renderCmd(c, toks)))
        )
      )
    );
    observeSpy();
    focusFromHash();
  }

  /* ---------- navigation ---------- */
  function observeSpy() {
    if (state.spy) state.spy.disconnect();
    if (!("IntersectionObserver" in window)) return;
    state.spy = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          catsNav.querySelectorAll("a.on").forEach((a) => a.classList.remove("on"));
          const link = catsNav.querySelector(`a[data-cat="${CSS.escape(entry.target.id)}"]`);
          if (link) {
            link.classList.add("on");
            const box = catsNav;
            if (link.offsetTop < box.scrollTop || link.offsetTop > box.scrollTop + box.clientHeight - 40) box.scrollTop = link.offsetTop - 40;
          }
        }
      },
      { rootMargin: "-90px 0px -70% 0px" }
    );
    content.querySelectorAll(".cat").forEach((s) => state.spy.observe(s));
  }

  function focusFromHash() {
    const hash = decodeURIComponent(location.hash.slice(1));
    if (!hash) return;
    const target = document.getElementById(hash);
    if (!target) return;
    if (target.matches("details.cmd")) {
      target.open = true;
      target.classList.add("target");
    }
    target.scrollIntoView({ block: "start" });
  }

  /* ---------- wiring ---------- */
  let searchTimer;
  input.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.query = input.value.trim();
      if (state.data) render();
    }, 120);
  });
  document.addEventListener("keydown", (event) => {
    const typing = /^(input|textarea|select)$/i.test(document.activeElement?.tagName || "");
    if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      input.focus();
      input.select();
    } else if (event.key === "Escape" && document.activeElement === input) {
      if (input.value) {
        input.value = "";
        state.query = "";
        if (state.data) render();
      } else {
        input.blur();
      }
    }
  });
  document.querySelectorAll(".chip").forEach((chip) =>
    chip.addEventListener("click", () => {
      state.kind = chip.dataset.kind;
      document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("on", c === chip));
      if (state.data) render();
    })
  );
  window.addEventListener("hashchange", focusFromHash);
  if (window.matchMedia("(max-width: 900px)").matches) $("#sidebox").open = false;
  catsNav.addEventListener("click", (event) => {
    if (event.target.closest("a") && window.matchMedia("(max-width: 900px)").matches) $("#sidebox").open = false;
  });

  function showError(error, hasCache) {
    $("#meta").textContent = hasCache ? "Showing the last saved copy; the bot couldn't be reached." : "";
    if (hasCache) return;
    content.replaceChildren(
      el(
        "div",
        { class: "error", role: "alert" },
        el("h3", null, "Couldn't load the commands"),
        el("p", null, error && error.name === "AbortError" ? "The bot took too long to answer." : (error && error.message) || "Something went wrong."),
        el("button", { class: "btn btn-primary", type: "button", onclick: load }, "Try again")
      )
    );
  }

  async function load() {
    const cached = readCache();
    if (cached && !state.data) {
      state.data = cached.data;
      renderStats();
      render();
    } else if (!state.data) {
      content.replaceChildren(el("div", { class: "skeleton", "aria-hidden": "true" }, [1, 2, 3, 4, 5, 6].map(() => el("i"))));
    }
    try {
      const fresh = await fetchCatalog();
      state.data = fresh;
      writeCache(fresh);
      renderStats();
      render();
    } catch (error) {
      showError(error, Boolean(state.data));
    }
  }

  load();
})();
