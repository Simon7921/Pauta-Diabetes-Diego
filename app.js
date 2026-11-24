/* app.js — Presentación (Midnight Energy). Lógica en calc.js, datos en store.js. */
(function () {
  "use strict";
  var C = window.Calc, S = window.Store.create();
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (t) { return String(t == null ? "" : t).replace(/[&<>"']/g, function (m) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]; }); };
  var norm = function (t) { return String(t).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); };
  var fmt = C.fmt, dec = function (x) { return String(x).replace(".", ","); };
  var ico = function (n, cls) { return '<svg class="ico' + (cls ? " " + cls : "") + '" aria-hidden="true"><use href="#i-' + n + '"/></svg>'; };
  var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------- Estado (todo persistido localmente) ---------------- */
  var P = S.loadPauta(C.PAUTA_DEFAULT);
  // Migración única V22: ratio 1:20 según indicación médica comunicada el 22/11/2026.
  // Solo modifica el ratio, conserva objetivo y sensibilidad guardados.
  // Antes de cualquier dosificación verificar la indicación clínica vigente.
  try {
    if (!localStorage.getItem("diego.v3.pauta20261122ratio20")) {
      if (P.r !== 20) { P = Object.assign({}, P, { r: 20 }); S.savePauta(P); }
      localStorage.setItem("diego.v3.pauta20261122ratio20", "1");
    }
  } catch (e) {}
  // V23 mantiene parámetros individuales de glucosa y sensibilidad guardados.
  // Los ratios por comida son específicos; P.r queda como valor legado de desayuno.
  try {
    if (!localStorage.getItem("diego.v3.pauta20261123mealratios")) {
      if (P.r !== 20) { P = Object.assign({}, P, { r: 20 }); S.savePauta(P); }
      localStorage.setItem("diego.v3.pauta20261123mealratios", "1");
    }
  } catch (e) {}
  // V27: última pauta comunicada el 23/11/2026. P.r es solo un campo legado;
  // el cálculo usa C.ratioForMeal para cada comida.
  // Migración única: conserva objetivo y sensibilidad preexistentes.
  try {
    if (!localStorage.getItem("diego.v3.pauta20261123v27")) {
      if (P.r !== 18) { P = Object.assign({}, P, { r: 18 }); S.savePauta(P); }
      localStorage.setItem("diego.v3.pauta20261123v27", "1");
    }
  } catch (e) {}
  var custom = S.loadCustom(), recipes = S.loadRecipes(), favs = S.loadFavs(), plate = S.loadPlate();
  var usage = S.loadUsage(), hist = S.loadHistory(), rules = S.loadRules(), prefs = S.loadPrefs();
  var recent = S.loadList("recent"), favFoods = S.loadList("favFoods");
  var BASE = C.baseFoods();
  var pz = { recent: 0, sport: 0, sym: 0, src: "sensor", fromPlate: true };
  var ui = { cat: "Todos", q: "", screen: "inicio" };
  // La selección automática es una sugerencia al abrir: nunca se impone sobre un plato iniciado
  // ni sobre una elección manual durante esta sesión.
  var mealSelectionMode = "automatic", automaticMeal = null;
  function selectNextMealIfSafe() {
    if (mealSelectionMode !== "automatic" || plate.items.length) return false;
    var suggestion = C.nextMeal(new Date(), sched());
    if (!suggestion) return false;
    automaticMeal = suggestion;
    if (plate.meal !== suggestion.item.id) {
      plate.meal = suggestion.item.id;
      savePlate();
      return true;
    }
    return false;
  }


  function recipeFood(r) { return { id: "r:" + r.id, name: r.name, hc100: r.per100, unit: null, cat: "Recetas", kind: "recipe", state: "preparado", source: "Receta casera (peso final " + fmt(r.finalWeight, 0) + " g)" }; }
  function allFoods() { return BASE.concat(custom.map(function (f) { return Object.assign({ source: null }, f); }), recipes.filter(function (r) { return r.per100 != null; }).map(recipeFood)); }
  function findFood(id) { return allFoods().filter(function (f) { return f.id === id; })[0] || null; }
  function meal(id) { return C.MEALS.filter(function (m) { return m.id === id; })[0] || C.MEALS[0]; }
  function itemMode(it) { return it.mode || (it.unit ? "u" : "g"); }
  function qtyTxt(it) { var m = itemMode(it); return fmt(it.qty, 0).replace(/,0$/, "") + (m === "u" ? (it.qty == 1 ? " unidad" : " unidades") : " g"); }
  function srcTxt(f) { return f.kind === "custom" ? (f.source || "Tu etiqueta") : (f.source || "Tabla USDA (aprox.)"); }
  function metaTxt(f) { return (f.unit ? fmt(f.hc100 * f.unit / 100) + " g HC por unidad · " : "") + fmt(f.hc100) + " g HC/100 g"; }
  function stateBadge(f) { return f.state === "crudo" || f.state === "cocido" ? '<span class="badge-s ' + f.state + '">' + f.state + "</span>" : ""; }
  function plateTotal() { return C.plateTotal(plate.items); }
  function savePlate() { S.savePlate(plate); }
  // Saludo según la hora local del teléfono
  function greeting(h) { return h >= 5 && h < 12 ? "¡Buenos días, Diego! ☀️" : h >= 12 && h < 20 ? "¡Buenas tardes, Diego!" : "¡Buenas noches, Diego! 🌙"; }
  // Mensajes al agregar: celebran la acción de organizar, nunca valores de glucosa, carbohidratos ni dosis
  // Reconoce la acción (agregar), nunca el valor de carbohidratos
  var ADDED = ["¡Listo! Agregaste {n}", "{n} quedó en tu plato", "¡Bien organizado! {n} agregado"];
  function addedMsg(n) { return ADDED[Math.floor(Math.random() * ADDED.length)].replace("{n}", n.replace(/ \(.*\)/, "")); }

  /* ---------------- Componentes: toast, sheet, confirmación ---------------- */
  var tT;
  function toast(msg, icon) { var t = $("toast"); t.innerHTML = ico(icon || "check", "s") + "<span>" + esc(msg) + "</span>"; t.classList.add("on"); clearTimeout(tT); tT = setTimeout(function () { t.classList.remove("on"); }, 2200); }
  var lastFocus = null;
  function openSheet(html, mount) {
    lastFocus = lastFocus || document.activeElement;
    var old = $("shBody"), nb = document.createElement("div"); nb.id = "shBody"; old.parentNode.replaceChild(nb, old);
    nb.innerHTML = html; $("sheet").hidden = false;
    requestAnimationFrame(function () { $("scrim").classList.add("on"); $("sheet").classList.add("on"); });
    $("sheet").scrollTop = 0;
    if (mount) mount(nb);
    var f = nb.querySelector("input:not([type=file]),textarea,select,button"); if (f) setTimeout(function () { try { f.focus({ preventScroll: true }); } catch (e) {} }, 260);
  }
  function closeSheet() {
    $("scrim").classList.remove("on"); $("sheet").classList.remove("on");
    setTimeout(function () { if (!$("sheet").classList.contains("on")) $("sheet").hidden = true; }, 260);
    if (lastFocus && lastFocus.focus) try { lastFocus.focus({ preventScroll: true }); } catch (e) {} lastFocus = null;
  }
  $("scrim").addEventListener("click", closeSheet); $("shX").addEventListener("click", closeSheet);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && $("sheet").classList.contains("on")) closeSheet(); });
  // Modal de confirmación para acciones destructivas o sensibles
  function confirmModal(o) {
    openSheet('<h3 id="shT">' + esc(o.title) + '</h3><p class="t2" style="margin:6px 0 16px">' + esc(o.text) + '</p><div class="grid2"><button class="btn btn-secondary" id="cNo">Cancelar</button><button class="btn ' + (o.danger ? "btn-danger solid" : "btn-primary") + '" id="cOk">' + esc(o.ok) + '</button></div>', function (b) {
      b.querySelector("#cNo").onclick = closeSheet;
      b.querySelector("#cOk").onclick = function () { closeSheet(); setTimeout(o.onOk, 10); };
    });
  }
  function animateNum(el, to, suffix) {
    var from = +el.dataset.v || 0; el.dataset.v = to;
    if (reduced || from === to) { el.innerHTML = fmt(to) + suffix; return; }
    var t0 = performance.now(), d = 220;
    (function step(t) { var k = Math.min(1, (t - t0) / d); el.innerHTML = fmt(from + (to - from) * (1 - Math.pow(1 - k, 3))) + suffix; if (k < 1) requestAnimationFrame(step); })(t0);
  }

  /* ---------------- Navegación ---------------- */
  var SCREENS = ["inicio", "alimentos", "recetas", "favoritos", "pauta", "perfil", "historial"];
  var NAVOF = { inicio: "inicio", favoritos: "inicio", perfil: "inicio", alimentos: "alimentos", recetas: "recetas", pauta: "pauta", historial: "pauta" };
  function show(name, push) {
    if (SCREENS.indexOf(name) < 0) name = "inicio";
    ui.screen = name; $("boot").hidden = true; document.documentElement.classList.toggle("fit", name === "inicio");
    SCREENS.forEach(function (k) { var el = $("s-" + k); el.hidden = k !== name; if (k === name) { el.classList.remove("enter"); void el.offsetWidth; el.classList.add("enter"); } });
    document.querySelectorAll(".nav button").forEach(function (b) { if (b.dataset.go === NAVOF[name]) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
    ({ inicio: renderInicio, alimentos: renderFoods, recetas: renderRecipes, favoritos: renderFavs, pauta: enterPauta, perfil: renderPerfil, historial: renderHist })[name]();
    if (push !== false && location.hash !== "#" + name) { try { history.pushState(null, "", "#" + name); } catch (e) {} }
    window.scrollTo(0, 0);
  }
  document.addEventListener("click", function (e) { var b = e.target.closest("[data-go]"); if (b && !b.closest("#sheet")) show(b.dataset.go); });
  window.addEventListener("popstate", function () { closeSheet(); show((location.hash || "#inicio").slice(1), false); });

  /* ================= 1. INICIO / MI COMIDA ================= */
  
  var MEAL_ICON = { desayuno: "coffee", colacion: "cookie", almuerzo: "salad", once: "apple", cena: "cloche" };
  // Miniatura por alimento (emoji como ilustración; el nombre siempre va en texto)
  var THUMBS = [[/marraqueta|hallulla|pan /, "🍞"], [/pl[aá]tano/, "🍌"], [/manzana/, "🍎"], [/pi[nñ]a/, "🍍"], [/palta/, "🥑"], [/tomate/, "🍅"], [/huevo/, "🥚"], [/yogh|yogur|leche/, "🥛"], [/queso/, "🧀"], [/helado/, "🍦"], [/corn|cereal|avena/, "🥣"], [/galleta/, "🍪"], [/fideo|tallar/, "🍝"], [/papas fritas/, "🍟"], [/pur[eé]|papa/, "🥔"], [/jugo|n[eé]ctar|bebida/, "🧃"], [/naranja|mandarina/, "🍊"]];
  function thumb(f) { var n = norm(f.name); if (String(f.fid || f.id || "").indexOf("r:") === 0) return "🍲"; for (var i = 0; i < THUMBS.length; i++) if (THUMBS[i][0].test(n)) return THUMBS[i][1]; return "🍽️"; }
  // Color de la referencia: verde hasta la pauta; de +0 a +15 g pasa por amarillo y naranjo hasta rojo
  function refColor(el, dif) {
    var light = document.documentElement.getAttribute("data-mode") === "light";
    if (dif <= 0) { el.style.setProperty("--refc", light ? "#3F6212" : "#B8FF3B"); return; }
    var stops = light ? [[0, [161, 98, 7]], [7.5, [194, 65, 12]], [15, [217, 45, 32]]] : [[0, [250, 230, 80]], [7.5, [255, 150, 60]], [15, [255, 90, 95]]];
    var x = Math.min(dif, 15), i = x <= 7.5 ? 0 : 1, a = stops[i], b = stops[i + 1], t = (x - a[0]) / (b[0] - a[0]);
    var rgb = a[1].map(function (v, k) { return Math.round(v + (b[1][k] - v) * t); });
    el.style.setProperty("--refc", "rgb(" + rgb.join(",") + ")");
  }
  // Recordatorio de vitamina D (5 gotas con el desayuno, según la ficha). Se muestra de 5:00 a 11:59 hasta marcarlo.
  function todayKey() { var d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
  function dropsDone() { try { return localStorage.getItem("diego.v3.drops") === todayKey(); } catch (e) { return false; } }
  function renderDrops(h) {
    var el = $("hello"), morning = h >= 5 && h < 12, pending = morning && !dropsDone();
    el.classList.toggle("drops", pending);
    el.setAttribute("role", pending ? "button" : "text"); el.setAttribute("aria-label", pending ? "¿Tomaste tus 5 gotitas de vitamina D? Toca para marcar" : el.textContent); el.tabIndex = pending ? 0 : -1;
    el.textContent = pending ? "💧 ¿Tomaste tus gotitas?" : morning ? "✓ Gotitas listas" : "¡Vamos, Diego! ⚡";
  }
  function markDrops() {
    if (!$("hello").classList.contains("drops")) return;
    try { localStorage.setItem("diego.v3.drops", todayKey()); } catch (e) {}
    renderDrops(new Date().getHours()); toast("¡Listo! Gotitas tomadas 💧", "check");
  }
  $("hello").addEventListener("click", markDrops);
  $("hello").addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); markDrops(); } });
  function renderInicio() {
    selectNextMealIfSafe();
    var d = new Date(), h = d.getHours();
    $("hiT").textContent = h >= 5 && h < 12 ? "¡Buenos días, Diego!" : h >= 20 || h < 5 ? "¡Buenas noches, Diego!" : "¡Hola, Diego!";
    renderDrops(h);
    $("meals").innerHTML = C.MEALS.map(function (m) { return '<button type="button" class="chip" data-m="' + m.id + '" aria-label="Armar plato para ' + esc(m.name) + '" aria-pressed="' + (plate.meal === m.id) + '">' + ico(MEAL_ICON[m.id]) + m.name + "</button>"; }).join("");
    var status = $("mealSelectionStatus");
    if (status) {
      var suggestion = C.nextMeal(d, sched()), label = meal(plate.meal).name;
      if (plate.items.length) status.textContent = "Preparando: " + label + " · Puedes cambiar la comida manualmente";
      else if (mealSelectionMode === "manual") status.textContent = "Elegida por ti: " + label + " · Puedes cambiarla cuando quieras";
      else if (suggestion && suggestion.item.id === plate.meal) status.textContent = "Comida más cercana según horario: " + label + " · " + suggestion.item.t + (suggestion.tomorrow ? " (mañana)" : suggestion.yesterday ? " (ayer)" : "") + " · Puedes cambiarla";
      else status.textContent = "Seleccionada: " + label + " · Puedes cambiarla cuando quieras";
    }
    var m = meal(plate.meal), tot = plateTotal(), n = plate.items.length;
    var ratioEl = $("homeMealRatio"), activeMealRatio = C.ratioForMeal(plate.meal);
    if (ratioEl) { ratioEl.querySelector("strong").textContent = m.name + " · " + (activeMealRatio == null ? "Sin insulina" : "1:" + activeMealRatio); }
    animateNum($("total"), tot, " g HC");
    $("refHC").textContent = m.hc + " g HC";
    var dif = C.round1(tot - m.hc), df = $("diff");
    df.hidden = !n;
    refColor($("phRef"), n ? dif : 0);
    if (n) { df.textContent = dif === 0 ? "= referencia" : (dif > 0 ? "+" : "−") + fmt(Math.abs(dif)) + " g"; df.setAttribute("aria-label", dif === 0 ? "Igual a la referencia" : fmt(Math.abs(dif)) + " gramos " + (dif > 0 ? "más" : "menos") + " que la referencia"); }
    $("plateCount").textContent = n ? "(" + n + (n === 1 ? " alimento)" : " alimentos)") : "";
    $("addFood").innerHTML = n ? ico("plus") + "Agregar" : "¡Vamos a elegir!" + ico("arrow");
    $("plate").innerHTML = n ? plate.items.map(function (it, i) {
      return '<li class="li" data-i="' + i + '"><button class="main" data-edit="' + i + '" aria-label="' + esc(it.name) + ", " + qtyTxt(it) + ", " + fmt(it.hc) + ' gramos de carbohidratos. Editar cantidad o quitar"><span class="thumb" aria-hidden="true">' + thumb(it) + '</span><span class="tx"><span class="nm2">' + esc(it.name.replace(/ \(unidad\)| \(sin cáscara\)| \(mitad\)/, "")) + '</span><span class="qt">' + qtyTxt(it) + '</span></span><span class="hcpill">' + fmt(it.hc) + ' g</span><svg class="ico s chev" aria-hidden="true"><use href="#i-chev"/></svg></button></li>';
    }).join("") : '<li class="empty">' + ico("utensils") + "<p>Tu plato está vacío por ahora.<br>¿Qué se te antoja?</p></li>";
    $("dot").textContent = n || "";
    renderNext();
  }
  $("meals").addEventListener("click", function (e) {
    var b = e.target.closest("[data-m]"); if (!b) return;
    var target = b.dataset.m;
    function startMeal() { mealSelectionMode = "manual"; plate.meal = target; savePlate(); renderInicio(); show("alimentos"); }
    if (target === plate.meal || !plate.items.length) { startMeal(); return; }
    confirmModal({
      title: "¿Empezar " + meal(target).name.toLowerCase() + "?",
      text: "Tu plato actual de " + meal(plate.meal).name.toLowerCase() + " tiene " + plate.items.length + " alimento(s). Para no mezclar comidas, al cambiar se vaciará. Puedes cancelar y guardar el plato primero.",
      ok: "Cambiar y vaciar", danger: true,
      onOk: function () { plate.items = []; startMeal(); }
    });
  });
  // Acciones fotográficas visibles desde Inicio. El HTML de prueba nunca simula análisis IA.
  document.querySelectorAll("[data-photo-jump]").forEach(function (b) {
    b.addEventListener("click", function () {
      show("alimentos");
      var target = b.dataset.photoJump === "label" ? $("labelPhotoPanel") : $("platePhotoPanel");
      if (target) {
        $("labelPhotoPanel").open = target === $("labelPhotoPanel");
        $("platePhotoPanel").open = target === $("platePhotoPanel");
        setTimeout(function () { target.scrollIntoView({behavior:"smooth",block:"start"}); }, 90);
      }
    });
  });
  $("plate").addEventListener("click", function (e) {
    var ed = e.target.closest("[data-edit]"); if (!ed) return;
    var k = +ed.dataset.edit, x = plate.items[k]; var f = findFood(x.fid) || { id: x.fid, name: x.name, hc100: x.hc100, unit: x.unit, kind: "plate" }; qtySheet(f, k);
  });
  function removeItem(i) { var it = plate.items.splice(i, 1)[0]; savePlate(); renderInicio(); toast("Listo, quitamos " + it.name, "trash"); }
  function clearPlate() { if (!plate.items.length) { toast("El plato ya está vacío", "info"); return; } confirmModal({ title: "¿Vaciamos el plato?", text: "Se quitan todos los alimentos de " + meal(plate.meal).name.toLowerCase() + ".", ok: "Sí, vaciar", danger: true, onOk: function () { plate.items = []; savePlate(); renderInicio(); toast("Plato vacío", "trash"); } }); }
  $("moreBtn").addEventListener("click", function () {
    openSheet('<h3 id="shT">Opciones del plato</h3><div style="margin-top:8px">' +
      '<button class="set" id="mSave"><span class="ic">' + ico("bookmark", "s") + '</span><span class="tx"><b>Guardar esta comida</b><span>Para repetirla en un toque</span></span></button>' +
      '<button class="set" id="mFavs"><span class="ic">' + ico("heart", "s") + '</span><span class="tx"><b>Mis comidas guardadas</b><span>Elige una y ajusta cantidades</span></span></button>' +
      '<button class="set" id="mPauta"><span class="ic">' + ico("drop", "s") + '</span><span class="tx"><b>Calcular en mi pauta</b><span>Con el total de este plato</span></span></button>' +
      '<button class="set" id="mClear"><span class="ic" style="color:var(--danger)">' + ico("trash", "s") + '</span><span class="tx"><b style="color:var(--danger)">Vaciar plato</b><span>Pide confirmación</span></span></button></div>', function (b) {
      b.querySelector("#mSave").onclick = function () { closeSheet(); setTimeout(function () { $("saveFav").click(); }, 260); };
      b.querySelector("#mFavs").onclick = function () { closeSheet(); show("favoritos"); };
      b.querySelector("#mPauta").onclick = function () { closeSheet(); pz.fromPlate = true; show("pauta"); };
      b.querySelector("#mClear").onclick = function () { clearPlate(); };
    });
  });

  /* ================= 4. FAVORITAS ================= */
  function favTotal(f) { return C.plateTotal(f.items.map(function (it) { return { hc: C.hcFor(it, it.qty, itemMode(it)) }; })); }
  function favCard(f) {
    var i = favs.indexOf(f);
    return '<div class="card fcard"><div class="row"><b style="font-size:17px" class="sp">' + esc(f.name) + '</b><span class="tag">' + meal(f.meal).name + '</span></div><div class="items">' + f.items.map(function (it) { return esc(it.name) + " · " + qtyTxt(it); }).join("<br>") + '</div><div class="row"><div class="sp"><span class="tot">' + fmt(favTotal(f)) + '</span> <span class="t2">g HC</span></div><button class="btn btn-primary" style="width:auto;min-height:44px" data-use="' + i + '">Usar</button></div></div>';
  }
  function renderFavs() {
    $("favList").innerHTML = favs.length ? favs.map(function (f, i) { return favCard(f).replace('<button class="btn btn-primary"', '<button class="ibtn" data-delfav="' + i + '" aria-label="Eliminar ' + esc(f.name) + '">' + ico("trash", "s") + '</button><button class="btn btn-primary"'); }).join("")
      : '<div class="card empty">' + ico("heart") + '<p>Todavía no guardas comidas.<br>Arma tu plato en Inicio y toca "Guardar favorita".</p><button class="btn btn-primary" data-go="inicio">¡Vamos a armar uno!</button></div>';
  }
  function useFav(i) {
    var f = favs[i];
    var rows = f.items.map(function (it, k) { var m = itemMode(it); return '<div class="li"><div class="main"><span class="nm">' + esc(it.name) + '</span><span class="mt">' + (m === "u" ? "unidades" : "gramos") + '</span></div><div class="inp s" style="width:130px"><input data-k="' + k + '" inputmode="decimal" value="' + dec(it.qty) + '" aria-label="Cantidad de ' + esc(it.name) + '"><span>' + (m === "u" ? "u" : "g") + "</span></div></div>"; }).join("");
    openSheet('<h3 id="shT">' + esc(f.name) + '</h3><p class="t2 small" style="margin:0 0 8px">¿Un poquito más o menos? Ajusta antes de cargar. No se copian glicemias ni dosis.</p>' + rows + '<div class="calc"><b id="fT"></b>g HC</div><div class="grid2"><button class="btn btn-primary" id="fRep">Usar esta</button><button class="btn btn-secondary" id="fAdd">Sumar al plato</button></div>', function (b) {
      function items() { return f.items.map(function (it, k) { var q = C.num(b.querySelector('[data-k="' + k + '"]').value); var o = { fid: it.fid, name: it.name, unit: it.unit, hc100: it.hc100, mode: itemMode(it), qty: q > 0 ? q : it.qty }; o.hc = C.hcFor(o, o.qty, o.mode); return o; }); }
      function upd() { b.querySelector("#fT").textContent = fmt(C.plateTotal(items())); }
      b.addEventListener("input", upd); upd();
      b.querySelector("#fRep").onclick = function () { plate.items = items(); plate.meal = f.meal; mealSelectionMode = "manual"; savePlate(); closeSheet(); show("inicio"); toast("¡Listo! Cargamos " + f.name + " ⚡"); };
      b.querySelector("#fAdd").onclick = function () { plate.items = plate.items.concat(items()); savePlate(); closeSheet(); show("inicio"); toast("Sumamos " + f.name + " a tu plato"); };
    });
  }
  document.addEventListener("click", function (e) {
    var u = e.target.closest("[data-use]"), d = e.target.closest("[data-delfav]");
    if (u) useFav(+u.dataset.use);
    if (d) { var i = +d.dataset.delfav; confirmModal({ title: "¿Borramos esta comida?", text: favs[i].name + " se borrará de tus comidas de siempre.", ok: "Sí, borrar", danger: true, onOk: function () { favs.splice(i, 1); S.saveFavs(favs); renderFavs(); toast("Comida borrada", "trash"); } }); }
  });
  $("saveFav").addEventListener("click", function () {
    if (!plate.items.length) { toast("Primero arma tu plato y después la guardamos", "info"); return; }
    openSheet('<h3 id="shT">Guardemos esta comida 💚</h3><p class="t2 small">Queda con sus alimentos y cantidades, para repetirla cuando quieras. Nunca se guardan dosis ni glicemias.</p><label class="f" for="fvN">¿Cómo la llamamos?</label><input class="in s" id="fvN" value="' + esc(meal(plate.meal).name + " habitual") + '"><div class="err" id="fvE"></div><button class="btn btn-primary" id="fvOk" style="margin-top:12px">Guardar</button>', function (b) {
      b.querySelector("#fvOk").onclick = function () {
        var n = b.querySelector("#fvN").value.trim(); if (!n) { b.querySelector("#fvE").textContent = "Ponle un nombre para encontrarla después."; b.querySelector("#fvN").setAttribute("aria-invalid", "true"); return; }
        favs = favs.filter(function (f) { return norm(f.name) !== norm(n); });
        favs.push({ id: Date.now().toString(36), name: n, meal: plate.meal, items: plate.items.map(function (it) { return { fid: it.fid, name: it.name, qty: it.qty, unit: it.unit, hc100: it.hc100, mode: itemMode(it) }; }) });
        S.saveFavs(favs); closeSheet(); renderInicio(); toast("¡Bien organizado! Guardaste " + n, "heart");
      };
    });
  });

  /* ================= 2. EXPLORADOR DE ALIMENTOS ================= */
  $("newFood").innerHTML = ico("plus", "s") + "¿No está? Créalo con su etiqueta";
  // Desayuno y once: se ocultan almuerzos (papas, fideos, carnes, helado...). La búsqueda y "Ver todo" muestran todo.
  var NOT_BREAKFAST = /helado|carne|pollo|vacuno|cerdo|pescado|ensalada|arroz|fideo|tallar|papa|pur[eé]|lenteja|porot|garbanzo|cazuela|pastel|lasa|pizza|hamburg|empanada|sopa|charquic|zapall|choclo|salchicha|vienesa|lomo|bistec|filete|chuleta|merluza|salmon|at[uú]n/;
  function breakfastMode() { return (plate.meal === "desayuno" || plate.meal === "once") && !ui.showAll; }
  function okBreakfast(f) { return f.cat !== "Acompañamientos" && !NOT_BREAKFAST.test(norm(f.name)); }
  function renderFoods() {
    $("addingTo").textContent = "¡Vamos a elegir! Agregando a: " + meal(plate.meal).name;
    var currentMealRatio = C.ratioForMeal(plate.meal);
    $("addingTo").textContent += " · " + (currentMealRatio == null ? "Sin insulina" : "Ratio 1:" + currentMealRatio);
    var bm = breakfastMode(), canFilter = plate.meal === "desayuno" || plate.meal === "once";
    var cats = ["Todos", "Recientes", "Favoritos", "Mis alimentos"]; if (recipes.length) cats.push("Recetas"); cats = cats.concat(Object.keys(C.FOODS).filter(function (c) { return !bm || c !== "Acompañamientos"; }));
    if (cats.indexOf(ui.cat) < 0) ui.cat = "Todos";
    $("cats").innerHTML = (canFilter ? '<button class="chip" id="showAll" aria-pressed="false">' + (ui.showAll ? "Solo " + meal(plate.meal).name.toLowerCase() : "Ver todo") + "</button>" : "") + cats.map(function (c) { return '<button class="chip" data-cat="' + esc(c) + '" aria-pressed="' + (ui.cat === c) + '">' + (c === "Favoritos" ? "★ " : "") + esc(c) + "</button>"; }).join("");
    if (bm) $("addingTo").textContent = "Agregando a: " + meal(plate.meal).name + " · " + (currentMealRatio == null ? "Sin insulina" : "Ratio 1:" + currentMealRatio) + " · solo lo de " + meal(plate.meal).name.toLowerCase();
    var list = allFoods(), q = norm(ui.q.trim());
    if (ui.cat === "Recientes") list = recent.map(findFood).filter(Boolean);
    else if (ui.cat === "Favoritos") list = list.filter(function (f) { return favFoods.indexOf(f.id) >= 0; });
    else if (ui.cat !== "Todos") list = list.filter(function (f) { return f.cat === ui.cat; });
    if (bm && !q) list = list.filter(okBreakfast);
    if (q) list = list.filter(function (f) { return norm(f.name).indexOf(q) >= 0; });
    var emptyMsg = { Recientes: "Lo último que agregues va a aparecer aquí.", Favoritos: "Marca con ★ lo que más comes y lo tendrás siempre a mano.", "Mis alimentos": "Aquí quedan los alimentos que crees con su etiqueta." }[ui.cat] || "No hay alimentos en esta categoría.";
    $("foods").innerHTML = list.length ? list.map(function (f) {
      var fav = favFoods.indexOf(f.id) >= 0;
      return '<li class="li"><span class="thumb" aria-hidden="true" style="width:44px;height:44px;font-size:24px">' + thumb(f) + '</span><button class="main" data-f="' + esc(f.id) + '"><span class="nm">' + (fav ? '<span style="color:var(--warning)" aria-label="favorito">★</span> ' : "") + esc(f.name) + stateBadge(f) + '</span><span class="mt">' + metaTxt(f) + " · " + esc(srcTxt(f)) + '</span></button><button class="ibtn add" data-f="' + esc(f.id) + '" aria-label="Agregar ' + esc(f.name) + '">' + ico("plus") + "</button></li>";
    }).join("") : '<li class="empty">' + ico("search") + "<p>" + (q ? 'No encontramos "' + esc(ui.q) + '".<br>¿Lo creamos con los datos de su etiqueta?' : emptyMsg) + "</p></li>";
  }
  $("q").addEventListener("input", function () { ui.q = this.value; renderFoods(); });
  $("cats").addEventListener("click", function (e) { if (e.target.closest("#showAll")) { ui.showAll = !ui.showAll; renderFoods(); return; } var b = e.target.closest("[data-cat]"); if (!b) return; ui.cat = b.dataset.cat; renderFoods(); });
  $("foods").addEventListener("click", function (e) { var b = e.target.closest("[data-f]"); if (!b) return; var f = findFood(b.dataset.f); if (f) qtySheet(f, null); });
  $("newFood").addEventListener("click", function () { foodSheet(null); });

  // Bottom sheet: cantidad + unidad + cálculo en vivo
  function qtySheet(food, editIdx) {
    var editing = editIdx != null, it = editing ? plate.items[editIdx] : null;
    var mode = editing ? itemMode(it) : (food.unit && prefs.qty !== "g" ? "u" : "g");
    var fav = favFoods.indexOf(food.id) >= 0;
    var unitSeg = food.unit ? '<div class="seg full" id="qMode" role="group" aria-label="Unidad" style="margin-bottom:12px"><button data-v="u" aria-pressed="' + (mode === "u") + '">Unidades (' + fmt(food.unit, 0) + ' g c/u)</button><button data-v="g" aria-pressed="' + (mode === "g") + '">Gramos</button></div>' : "";
    var rmBtn = editing ? '<button class="btn btn-danger" id="qRm" style="margin-top:10px">' + ico("trash", "s") + "Quitar del plato</button>" : "";
    var extra = rmBtn + (food.kind === "custom" ? '<div class="grid2" style="margin-top:10px"><button class="btn btn-secondary" id="qEd">' + ico("pencil", "s") + 'Editar</button><button class="btn btn-danger" id="qDel">' + ico("trash", "s") + "Eliminar</button></div>" : "");
    openSheet('<h3 id="shT">' + esc(food.name) + stateBadge(food) + '</h3><p class="t2 small" style="margin:0 0 14px">' + metaTxt(food) + "<br>Fuente: " + esc(srcTxt(food)) + "</p>" + unitSeg +
      '<label class="f" for="qQ" id="qL"></label><div class="inp"><input id="qQ" inputmode="decimal" autocomplete="off" value="' + (editing ? dec(it.qty) : (mode === "u" ? "1" : "")) + '"><span id="qU"></span></div><div class="quick" id="qk"></div>' +
      '<p class="t2 small" style="margin:8px 0 0;text-align:center">' + (editing ? "¿Un poquito más o menos? Ajusta y listo." : "") + '</p><div class="calc"><b id="qR">0</b>g HC</div><div class="row"><button class="ibtn' + (fav ? " on" : "") + '" id="qFav" aria-pressed="' + fav + '" aria-label="Marcar como favorito" style="border:1px solid var(--border2)">' + ico("star") + '</button><button class="btn btn-primary sp" id="qOk">' + (editing ? "Guardar cambios" : "Agregar al plato") + "</button></div>" + extra, function (b) {
      var inp = b.querySelector("#qQ");
      function lab() {
        b.querySelector("#qL").textContent = mode === "u" ? "¿Cuántas unidades?" : "¿Cuánto vas a comer? (g o ml)"; b.querySelector("#qU").textContent = mode === "u" ? "u" : "g/ml"; inp.placeholder = mode === "u" ? "1" : "Ej. 120";
        b.querySelector("#qk").innerHTML = (mode === "u" ? [1, 2, 3] : [50, 100, 150, 200]).map(function (v) { return '<button data-v="' + v + '">' + v + (mode === "u" ? "" : " g") + "</button>"; }).join("");
      }
      function upd() { var q = C.num(inp.value); b.querySelector("#qR").textContent = fmt(q > 0 ? C.hcFor(food, q, mode) : 0); }
      lab(); upd(); inp.addEventListener("input", upd);
      var ms = b.querySelector("#qMode"); if (ms) ms.addEventListener("click", function (e) { var x = e.target.closest("[data-v]"); if (!x) return; mode = x.dataset.v; ms.querySelectorAll("button").forEach(function (y) { y.setAttribute("aria-pressed", String(y === x)); }); inp.value = mode === "u" ? "1" : ""; lab(); upd(); inp.focus(); });
      b.querySelector("#qk").addEventListener("click", function (e) { var x = e.target.closest("[data-v]"); if (x) { inp.value = x.dataset.v; upd(); } });
      b.querySelector("#qFav").onclick = function () { var i = favFoods.indexOf(food.id); if (i >= 0) favFoods.splice(i, 1); else favFoods.push(food.id); S.saveList("favFoods", favFoods); var on = i < 0; this.classList.toggle("on", on); this.setAttribute("aria-pressed", on); toast(on ? "Guardado en tus favoritos ★" : "Quitado de tus favoritos", "star"); if (ui.screen === "alimentos") renderFoods(); };
      b.querySelector("#qOk").onclick = function () {
        var q = C.num(inp.value); if (!(q > 0)) { inp.setAttribute("aria-invalid", "true"); toast("Escribe una cantidad mayor que 0", "info"); inp.focus(); return; }
        var o = { fid: food.id, name: food.name, qty: q, unit: food.unit || null, hc100: food.hc100, mode: mode, hc: C.hcFor(food, q, mode) };
        if (editing) { plate.items[editIdx] = o; toast("Listo, actualizamos " + food.name); }
        else { plate.items.push(o); recent = [food.id].concat(recent.filter(function (x) { return x !== food.id; })).slice(0, 12); S.saveList("recent", recent); usage[food.id] = (usage[food.id] || 0) + 1; S.saveUsage(usage); toast(addedMsg(food.name), "plus"); }
        savePlate(); closeSheet(); if (ui.screen === "inicio") renderInicio(); else { $("dot").textContent = plate.items.length || ""; if (ui.screen === "alimentos") renderFoods(); }
      };
      var rmb = b.querySelector("#qRm"); if (rmb) rmb.onclick = function () { closeSheet(); removeItem(editIdx); };
      var ed = b.querySelector("#qEd"); if (ed) ed.onclick = function () { foodSheet(food); };
      var dl = b.querySelector("#qDel"); if (dl) dl.onclick = function () { confirmModal({ title: "¿Borramos " + food.name + "?", text: "Se quita de Mis alimentos. Los platos que ya armaste no cambian.", ok: "Sí, borrar", danger: true, onOk: function () { custom = custom.filter(function (f) { return f.id !== food.id; }); S.saveCustom(custom); renderFoods(); toast("Alimento borrado", "trash"); } }); };
    });
  }
  function foodSheet(food) {
    openSheet('<h3 id="shT">' + (food ? "Editemos este alimento" : "Creemos un alimento") + '</h3><p class="t2 small">Mira la tabla del envase: fila "Hidratos de carbono disponibles", columna por 100 g o 100 ml.</p>' +
      '<label class="f" for="nN">¿Cómo se llama?</label><input class="in s" id="nN" value="' + esc(food ? food.name : "") + '" placeholder="Ej. Helado vainilla Savory 0%">' +
      '<label class="f" for="nC" style="margin-top:12px">Hidratos de carbono por 100 g o 100 ml</label><div class="inp"><input id="nC" inputmode="decimal" value="' + (food ? dec(food.hc100) : "") + '" placeholder="Ej. 7,7"><span>g</span></div>' +
      '<label class="f" for="nU" style="margin-top:12px">Peso de una unidad (opcional)</label><div class="inp"><input id="nU" inputmode="decimal" value="' + (food && food.unit ? dec(food.unit) : "") + '" placeholder="Para contar por unidades"><span>g</span></div>' +
      '<label class="f" for="nS" style="margin-top:12px">Fuente (opcional)</label><input class="in s" id="nS" value="' + esc(food && food.source || "") + '" placeholder="Ej. Etiqueta Savory">' +
      '<div class="err" id="nE" role="alert"></div><button class="btn btn-primary" id="nOk" style="margin-top:12px">Guardar alimento</button>', function (b) {
      b.querySelector("#nOk").onclick = function () {
        var n = b.querySelector("#nN").value.trim(), c = C.num(b.querySelector("#nC").value), u = C.num(b.querySelector("#nU").value), e = b.querySelector("#nE");
        b.querySelectorAll("[aria-invalid]").forEach(function (x) { x.removeAttribute("aria-invalid"); });
        if (!n) { e.textContent = "Falta el nombre del alimento."; b.querySelector("#nN").setAttribute("aria-invalid", "true"); return; }
        if (!(c >= 0 && c <= 100)) { e.textContent = "Los carbohidratos deben estar entre 0 y 100 g por cada 100 g."; b.querySelector("#nC").setAttribute("aria-invalid", "true"); return; }
        if (food) custom = custom.filter(function (f) { return f.id !== food.id; });
        custom = S.upsertCustom(custom, { name: n, hc100: c, unit: u > 0 ? u : null, source: b.querySelector("#nS").value.trim() || null }); S.saveCustom(custom);
        closeSheet(); ui.cat = "Mis alimentos"; ui.q = ""; $("q").value = ""; if (ui.screen === "alimentos") renderFoods(); if (ui.screen === "perfil") renderPerfil(); toast("¡Listo! " + n + " ya está en Mis alimentos");
      };
    });
  }


  /* Fotos V12: selectors nativos visibles; no dependen de ventanas emergentes. */
  function attachPhotoPreview(inputId, imageId) {
    var input = $(inputId), preview = $(imageId), url = null;
    if (!input || !preview) return;
    input.addEventListener("change", function () {
      if (url) { URL.revokeObjectURL(url); url = null; }
      var file = input.files && input.files[0];
      if (!file || !file.type.startsWith("image/")) { preview.hidden = true; preview.removeAttribute("src"); return; }
      url = URL.createObjectURL(file);
      preview.src = url; preview.hidden = false;
      preview.style.display = "block";
    });
  }
  attachPhotoPreview("labelPhotoInput", "labelPhotoPreview");
  attachPhotoPreview("platePhotoInput", "platePhotoPreview");
  $("labelSaveBtn").addEventListener("click", function () {
    var name = $("labelFoodName").value.trim(), hc = C.num($("labelHC").value);
    var unit = C.num($("labelSize").value), byUnit = $("labelBasis").value === "unit";
    var err = $("labelPhotoError"); err.textContent = "";
    if (!name) { err.textContent = "Escribe el nombre del producto."; return; }
    if (!(hc >= 0 && isFinite(hc))) { err.textContent = "Ingresa los gramos de HC indicados en la tabla."; return; }
    if (byUnit && !(unit > 0)) { err.textContent = "Ingresa el tamaño de la porción o unidad."; return; }
    var per100 = byUnit ? hc * 100 / unit : hc;
    if (!(per100 >= 0 && per100 <= 100)) { err.textContent = "Revisa el valor: los HC por 100 g/ml deben estar entre 0 y 100 g."; return; }
    custom = S.upsertCustom(custom, { name: name, hc100: per100, unit: unit > 0 ? unit : null, source: "Etiqueta nutricional ingresada manualmente (verificar envase)" });
    S.saveCustom(custom);
    ui.cat = "Mis alimentos"; ui.q = ""; $("q").value = "";
    $("labelPhotoPanel").open = false;
    renderFoods(); toast("Alimento guardado: " + name, "check");
  });
  $("plateChooseFoods").addEventListener("click", function () {
    $("platePhotoPanel").open = false;
    ui.cat = "Todos"; ui.q = ""; $("q").value = "";
    renderFoods(); $("q").focus();
    toast("Busca cada ingrediente del plato", "info");
  });

  /* ================= 3. CONSTRUCTOR DE RECETAS ================= */
  $("newRecipe").innerHTML = ico("plus") + "Crear una receta";
  function renderRecipes() {
    $("recipes").innerHTML = recipes.length ? recipes.map(function (r, i) {
      return '<div class="card" style="margin-bottom:12px"><div class="row"><b style="font-size:18px" class="sp">' + esc(r.name) + '</b><span class="tag">' + fmt(r.per100) + ' g/100 g</span></div><p class="t2 small" style="margin:6px 0 12px">' + r.ingredients.length + " ingredientes · peso final " + fmt(r.finalWeight, 0) + " g · " + fmt(r.totalHC) + ' g HC en total</p><div class="row" style="gap:8px"><button class="btn btn-primary sp" data-radd="' + i + '" style="min-height:44px">Servirme una porción</button><button class="ibtn" data-red="' + i + '" aria-label="Editar ' + esc(r.name) + '" style="border:1px solid var(--border2)">' + ico("pencil", "s") + '</button><button class="ibtn" data-rdup="' + i + '" aria-label="Duplicar ' + esc(r.name) + '" style="border:1px solid var(--border2)">' + ico("copy", "s") + "</button></div></div>";
    }).join("") : '<div class="card empty">' + ico("chef") + '<p>¿Algo rico hecho en casa? 🍲<br>Arma la receta y calculamos sus carbohidratos por 100 g.</p><button class="btn btn-secondary" id="exR">Probar con el puré casero</button></div>';
    var ex = $("exR"); if (ex) ex.onclick = function () { builder({ name: "Puré casero", ingredients: [{ name: "Papa cocida", hc100: 20, grams: 700, src: "Tabla USDA (aprox.)" }, { name: "Aceite de maravilla", hc100: 0, grams: 31, src: "Aceite: 0 g HC" }, { name: "Mantequilla", hc100: 0, grams: 50, src: "Tabla USDA (aprox.)" }, { name: "Leche entera", hc100: 4.8, grams: 39, src: "Tabla USDA (aprox.)" }], finalWeight: "" }); };
  }
  $("recipes").addEventListener("click", function (e) {
    var a = e.target.closest("[data-radd]"), ed = e.target.closest("[data-red]"), du = e.target.closest("[data-rdup]");
    if (a) qtySheet(recipeFood(recipes[+a.dataset.radd]), null);
    if (ed) builder(recipes[+ed.dataset.red]);
    if (du) { var r = JSON.parse(JSON.stringify(recipes[+du.dataset.rdup])); r.id = Date.now().toString(36); r.name += " (copia)"; recipes.push(r); S.saveRecipes(recipes); renderRecipes(); toast("Receta duplicada. ¡Ajústala a tu gusto!", "copy"); }
  });
  $("newRecipe").addEventListener("click", function () { builder(null); });

  function builder(r) {
    var existing = r && r.id ? r : null;
    var data = r ? JSON.parse(JSON.stringify(r)) : { name: "", finalWeight: "", ingredients: [{ name: "", hc100: "", grams: "" }] };
    var names = BASE.concat(custom);
    data.ingredients.forEach(function (g) { if (!g.src && g.name) { var m = names.filter(function (f) { return norm(f.name) === norm(g.name) && f.hc100 === g.hc100; })[0]; g.src = m ? "Fuente: " + srcTxt(m) : "Valor ingresado por ti"; } });
    var dl = '<datalist id="fdl">' + names.map(function (f) { return '<option value="' + esc(f.name) + '">'; }).join("") + "</datalist>";
    function row(g, k) { var v = function (x) { return x === "" || x == null || isNaN(x) ? "" : dec(x); }; return '<div class="ing" data-k="' + k + '"><input class="in" data-f="name" list="fdl" placeholder="Ingrediente" value="' + esc(g.name) + '" aria-label="Ingrediente ' + (k + 1) + '"><input class="in" data-f="hc100" inputmode="decimal" placeholder="HC/100" value="' + v(g.hc100) + '" aria-label="Carbohidratos por 100 g, ingrediente ' + (k + 1) + '"><input class="in" data-f="grams" inputmode="decimal" placeholder="g" value="' + v(g.grams) + '" aria-label="Gramos, ingrediente ' + (k + 1) + '"><button class="ibtn" data-rmi="' + k + '" aria-label="Quitar ingrediente ' + (k + 1) + '">' + ico("x", "s") + '</button><div class="src">' + esc(g.src || (g.name ? "Valor ingresado por ti" : "")) + "</div></div>"; }
    openSheet('<h3 id="shT">' + (existing ? "Editemos tu receta" : "Nueva receta 🍳") + "</h3><p class=\"t2 small\" style=\"margin:0\">¡Vamos paso a paso!</p>" + dl + '<div class="steps" style="margin-top:14px">' +
      '<div class="bstep"><h4>¿Cómo se llama?</h4><input class="in s" id="rN" value="' + esc(data.name) + '" placeholder="Ej. Puré casero" aria-label="Nombre de la receta"></div>' +
      '<div class="bstep"><h4>¿Qué lleva?</h4><div class="ing t2 small" aria-hidden="true" style="margin-bottom:2px"><span>Ingrediente</span><span>HC/100 g</span><span>Gramos</span><span></span></div><div id="rIng">' + data.ingredients.map(row).join("") + '</div><button class="sect lk" id="rAdd" style="margin:2px 0 0;padding:0;border:0;background:none;color:var(--accent-text)">+ Agregar ingrediente</button></div>' +
      '<div class="bstep"><h4>¿Cuánto de cada uno?</h4><p class="t2 small" style="margin:0">Pesa cada ingrediente antes de cocinar. Si lo eliges de la lista, su valor y fuente se completan solos.</p></div>' +
      '<div class="bstep"><h4>¿Cuánto pesó ya lista?</h4><div class="inp"><input id="rW" inputmode="decimal" placeholder="Pésala terminada, sin la olla" value="' + (data.finalWeight ? dec(data.finalWeight) : "") + '" aria-label="Peso final real de la preparación"><span>g</span></div><p class="t2 small" id="rRaw" style="margin:6px 0 0"></p></div>' +
      '<div class="bstep"><h4>Carbohidratos totales</h4><div class="sum" style="grid-template-columns:1fr"><div><span class="t2 small">Suma de los ingredientes</span><b id="rT">0 g</b></div></div></div>' +
      '<div class="bstep"><h4>Carbohidratos por 100 g</h4><div class="sum" style="grid-template-columns:1fr"><div><span class="t2 small">Total ÷ peso final × 100</span><b id="rP">—</b></div></div></div>' +
      '<div class="bstep"><h4>¿Cuánto te vas a servir?</h4><div class="inp"><input id="rPo" inputmode="decimal" placeholder="Tu porción" aria-label="Peso de la porción"><span>g</span></div><p class="t2" id="rPoR" style="margin:6px 0 0;font-weight:700"></p></div>' +
      '<div class="bstep"><h4>¡A guardar!</h4><div class="err" id="rE" role="alert"></div><button class="btn btn-primary" id="rOk">Guardar receta</button><button class="btn btn-secondary" id="rOkAdd" style="margin-top:8px">Guardar y servirme una porción</button>' + (existing ? '<button class="btn btn-danger" id="rDel" style="margin-top:8px">' + ico("trash", "s") + "Eliminar receta</button>" : "") + "</div></div>", function (b) {
      function read() {
        data.name = b.querySelector("#rN").value; data.finalWeight = C.num(b.querySelector("#rW").value);
        data.ingredients = [].map.call(b.querySelectorAll("#rIng .ing"), function (el, k) { return { name: el.querySelector('[data-f="name"]').value.trim(), hc100: C.num(el.querySelector('[data-f="hc100"]').value), grams: C.num(el.querySelector('[data-f="grams"]').value), src: data.ingredients[k] && data.ingredients[k].src }; });
        return C.recipe(data.ingredients, data.finalWeight);
      }
      function upd() {
        var rr = read();
        b.querySelector("#rT").textContent = fmt(rr.totalHC) + " g"; b.querySelector("#rP").textContent = rr.per100 != null ? fmt(rr.per100) + " g" : "—";
        b.querySelector("#rRaw").textContent = rr.rawWeight ? "Suma de ingredientes: " + fmt(rr.rawWeight, 0) + " g. El peso final puede ser distinto (agua, evaporación)." : "";
        var po = C.num(b.querySelector("#rPo").value);
        b.querySelector("#rPoR").textContent = po > 0 && rr.per100 != null ? fmt(po, 0) + " g de porción = " + fmt(po * rr.per100 / 100) + " g HC" : "";
      }
      function redraw() { b.querySelector("#rIng").innerHTML = data.ingredients.map(row).join(""); upd(); }
      b.addEventListener("input", function (e) {
        var t = e.target, el = t.closest(".ing");
        if (el) { var k = +el.dataset.k; if (t.dataset.f === "name") { var m = names.filter(function (f) { return norm(f.name) === norm(t.value); })[0]; if (m) { el.querySelector('[data-f="hc100"]').value = dec(m.hc100); data.ingredients[k].src = "Fuente: " + srcTxt(m); } else data.ingredients[k].src = "Valor ingresado por ti"; el.querySelector(".src").textContent = data.ingredients[k].src; } else if (t.dataset.f === "hc100") { data.ingredients[k].src = "Valor ingresado por ti"; el.querySelector(".src").textContent = data.ingredients[k].src; } }
        upd();
      });
      b.querySelector("#rAdd").onclick = function () { read(); data.ingredients.push({ name: "", hc100: "", grams: "" }); redraw(); var l = b.querySelectorAll('#rIng [data-f="name"]'); l[l.length - 1].focus(); };
      b.querySelector("#rIng").addEventListener("click", function (e) { var x = e.target.closest("[data-rmi]"); if (!x) return; read(); data.ingredients.splice(+x.dataset.rmi, 1); if (!data.ingredients.length) data.ingredients.push({ name: "", hc100: "", grams: "" }); redraw(); });
      upd();
      function save(addPortion) {
        var rr = read(), n = data.name.trim(), e = b.querySelector("#rE");
        var ings = data.ingredients.filter(function (i) { return i.name || i.grams > 0; });
        if (!n) { e.textContent = "Paso 1: falta el nombre de la receta."; b.querySelector("#rN").focus(); return; }
        if (!ings.length || ings.some(function (i) { return !i.name || !(i.grams > 0) || !(i.hc100 >= 0); })) { e.textContent = "Pasos 2 y 3: completa ingrediente, HC/100 g y gramos en cada fila."; return; }
        if (!(data.finalWeight > 0)) { e.textContent = "Paso 4: falta el peso final real de la preparación."; b.querySelector("#rW").setAttribute("aria-invalid", "true"); b.querySelector("#rW").focus(); return; }
        rr = C.recipe(ings, data.finalWeight);
        var obj = { id: existing ? existing.id : Date.now().toString(36), name: n, ingredients: ings, finalWeight: rr.finalWeight, totalHC: rr.totalHC, per100: C.round1(rr.per100), updated: Date.now() };
        if (existing) recipes = recipes.map(function (x) { return x.id === existing.id ? obj : x; }); else recipes.push(obj);
        S.saveRecipes(recipes);
        var po = C.num(b.querySelector("#rPo").value);
        if (addPortion) {
          if (!(po > 0)) { e.textContent = "Paso 7: falta el peso de tu porción."; b.querySelector("#rPo").focus(); return; }
          var f = recipeFood(obj); plate.items.push({ fid: f.id, name: f.name, qty: po, unit: null, hc100: f.hc100, mode: "g", hc: C.hcFor(f, po, "g") }); savePlate();
        }
        closeSheet(); renderRecipes(); toast("¡Receta guardada! 🍳 Ya la tienes en Alimentos" + (addPortion ? " · porción agregada" : ""));
      }
      b.querySelector("#rOk").onclick = function () { save(false); };
      b.querySelector("#rOkAdd").onclick = function () { save(true); };
      var del = b.querySelector("#rDel"); if (del) del.onclick = function () { confirmModal({ title: "¿Borramos esta receta?", text: existing.name + " se borrará. Los platos que ya armaste no cambian.", ok: "Sí, borrar", danger: true, onOk: function () { recipes = recipes.filter(function (x) { return x.id !== existing.id; }); S.saveRecipes(recipes); renderRecipes(); toast("Receta borrada", "trash"); } }); };
    });
  }

  /* ================= 5. MI PAUTA ================= */
  $("save").innerHTML = ico("check", "s") + "Guardar registro";
  $("toHist").innerHTML = ico("clock", "s") + "Ver mi historial";
  function renderParams() {
    var d = C.PAUTA_DEFAULT, mod = !(P.t === d.t && P.f === d.f && P.r === d.r);
    $("params").innerHTML = '<div class="kv"><span>Desayuno</span><b>1:18</b></div><div class="kv"><span>Almuerzo y cena</span><b>1:22</b></div><div class="kv"><span>Once</span><b>1:20</b></div><div class="kv"><span>Colaciones</span><b>Sin insulina</b></div><div class="kv"><span>Factor de sensibilidad</span><b>' + dec(P.f) + ' mg/dL</b></div><div class="kv"><span>Glucosa objetivo</span><b>' + dec(P.t) + ' mg/dL</b></div><div class="kv"><span>Basal (Tresiba)</span><b>12 U · 20:00</b></div>' + (mod ? '<div class="note warn" style="margin-top:8px">' + ico("alert") + "<div><b>Parámetros modificados</b>Distintos a la pauta indicada por la Dra. Revísalos en Perfil.</div></div>" : "");
  }
  function enterPauta() {
    var nI = plate.items.length; $("pMeal").textContent = meal(plate.meal).name + " · " + (nI ? nI + (nI === 1 ? " alimento" : " alimentos") + " en el plato" : "plato vacío");
    if (pz.fromPlate) $("pc").value = plate.items.length ? dec(C.round1(plateTotal())) : $("pc").value;
    renderParams(); compute();
  }
  $("syncPlate").addEventListener("click", function () { pz.fromPlate = true; $("pc").value = dec(C.round1(plateTotal())); compute(); toast("Usamos el total de tu plato: " + fmt(plateTotal()) + " g"); });
  $("pc").addEventListener("input", function () { pz.fromPlate = false; compute(); });
  $("pg").addEventListener("input", compute);
  document.querySelectorAll("#s-pauta .seg").forEach(function (s) {
    s.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; var v = b.dataset.v; pz[s.dataset.k] = isNaN(+v) ? v : +v; s.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); compute(); });
  });
  var NOTES = {
    "bolo-reciente": function (r) { return ["danger", "Puede haber insulina activa", "Hubo insulina rápida hace menos de 3 horas. Sumar otra corrección aumenta el riesgo de hipoglucemia. Consulta al equipo."]; },
    "bajo-objetivo": function (r) { return ["warn", "Glicemia bajo el objetivo", "La corrección resta " + dec2(-r.corr) + " U. Sin restarla serían " + dec2(r.food) + " U. Confirma con tu equipo cuál usar."]; },
    "deporte": function () { return ["warn", "Ejercicio próximo o reciente", "Puede bajar la glucosa durante y horas después, incluso de noche. El ajuste lo indica el equipo."]; },
    "cetonas": function () { return ["warn", "Glicemia sobre 250", "Mide cetonas si tienes cómo, sobre todo con náuseas, vómitos, dolor de estómago o enfermedad. Con cetonas o malestar, llama al equipo o consulta en urgencias."]; },
    "dosis-alta": function () { return ["danger", "Resultado alto", "Supera 15 U. Revisa la glicemia y los gramos."]; },
    "sin-hc": function () { return ["warn", "Faltan carbohidratos", "Ingresa los gramos de la comida."]; },
    "sintomas": function () { return ["warn", "Síntomas distintos a la lectura", "Confirma con glucómetro capilar antes de decidir."]; }
  };
  var LAST = null;
  function dec2(x) { return (Math.round(x * 100) / 100).toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 2 }); }
  function note(kind, title, txt) { return '<div class="note ' + kind + '">' + ico(kind === "info" ? "info" : "alert") + "<div><b>" + esc(title) + "</b>" + txt + "</div></div>"; }
  function compute() {
    var g = C.num($("pg").value), c = C.num($("pc").value);
    var mealId = plate.meal;
    var activeRatio = C.ratioForMeal(mealId);
    // Mostrar SIEMPRE la relación exacta usada en esta consulta, incluso con datos pendientes.
    // La información refleja la comida seleccionada, no un ratio global antiguo.
    var contextBox = $("pCalcContext");
    if (contextBox) {
      var hcLabel = Number.isFinite(c) && c >= 0 ? fmt(c) + " g HC" : "HC pendientes";
      var ratioLabel = activeRatio == null ? "Sin insulina (colación)" : "1:" + activeRatio;
      contextBox.innerHTML = "<strong>Ratio utilizado: " + ratioLabel + "</strong><span>" + esc(meal(mealId).name) + " · " + hcLabel + "</span>";
    }
    if (activeRatio == null) {
      LAST = null;
      $("gState").innerHTML = "";
      $("doseBox").innerHTML = '<div class="lab">Colación · sin insulina</div><div class="dv">No corresponde bolo</div><div class="brk">Se registran los HC, sin cálculo ni corrección de insulina para esta colación.</div>';
      $("result").innerHTML = note("info", "Indicación médica comunicada", "Las colaciones no llevan insulina. Si hay una glucosa baja o alta, sigue el plan específico de la diabetóloga; esta pantalla no calcula correcciones.");
      return;
    }
    var effectiveP = Object.assign({}, P, { r: activeRatio });
    var r = C.dose({ g: g, c: c, P: effectiveP, recent: pz.recent, sport: pz.sport, sym: pz.sym }), out = [];
    var st = "";
    if (r.range) { var lb = { low: "Baja · menos de 70", ok: "Entre 70 y 180", high: "Alta · 181 a 250", vhigh: "Muy alta · sobre 250" }[r.range.id]; st = '<span class="pill ' + r.range.id + '">' + (r.range.id === "ok" ? ico("info", "s") : ico("alert", "s")) + g + " mg/dL · " + lb + "</span>"; }
    if (pz.src === "sensor" && pz.sym) st += '<div style="margin-top:8px">' + note("warn", "Sensor y síntomas no coinciden", "Mide en el dedo (capilar) y usa ese valor.") + "</div>";
    $("gState").innerHTML = st;
    var box = "";
    if (!r.valid) { LAST = null; box = '<div class="lab">Dosis según la fórmula</div><div class="dv">—<small>U</small></div><div class="brk">Ingresa la glicemia</div>'; }
    else if (r.hypo) {
      LAST = { g: g, c: c || 0, dose: 0, hypo: 1 };
      box = '<div class="lab">Hipoglucemia</div><div class="dv stop">No inyectar</div><div class="brk">Primero hay que tratar la hipoglucemia</div>';
      out.push('<div class="note danger">' + ico("alert") + "<div><b>Qué hacer ahora</b>15 g de azúcar rápida (jugo, tabletas o azúcar en agua). Medir de nuevo a los 15 minutos y repetir si sigue bajo 70. Al recuperarse, volver a revisar la comida.</div></div>");
    } else {
      LAST = { g: g, c: c || 0, dose: r.main, corr: r.corr, food: r.food, recent: pz.recent, sport: pz.sport };
      box = '<div class="lab">' + (r.mode === "food-only" ? "Dosis: solo la parte de la comida" : "Dosis según la fórmula") + '</div><div class="dv">' + dec2(r.main) + "<small>U</small></div>" +
        '<div class="brk">' + (r.mode === "food-only" ? "Comida <b>" + fmt(r.food) + "</b> · corrección no sumada" : "Corrección <b>" + fmt(r.corr) + "</b> + Comida <b>" + fmt(r.food) + "</b>") + "</div>" +
        '<div class="rnd">Con decimales. El redondeo lo haces tú, según tu equipo.</div>';
    }
    $("doseBox").innerHTML = box;
    r.warnings.forEach(function (w) { if (w === "hipo") return; if (NOTES[w]) { var n = NOTES[w](r); out.push(note(n[0], n[1], n[2])); } });
    $("result").innerHTML = out.join("");
  }
  $("save").addEventListener("click", function () {
    if (plate.meal === "colacion") {
      hist.unshift({ t: Date.now(), meal: "Colación", src: pz.src, g: C.num($("pg").value), c: C.num($("pc").value), dose: null, ap: null, ratio: null, note: "Colación sin insulina según indicación médica" });
      S.saveHistory(hist); toast("Colación registrada sin insulina", "clock"); return;
    }
    if (!LAST) { toast("Primero ingresa la glicemia", "info"); $("pg").focus(); return; }
    var ap = C.num($("ap").value);
    hist.unshift(Object.assign({ t: Date.now(), meal: meal(plate.meal).name, src: pz.src, ratio: C.ratioForMeal(plate.meal), ap: isNaN(ap) ? null : ap }, LAST));
    S.saveHistory(hist); $("ap").value = ""; toast("Registro guardado. ¡Bien por llevar tu historial al día!", "clock");
  });

  /* ================= 6. PERFIL / CONFIGURACIÓN ================= */
  function renderPerfil() {
    var th = document.documentElement.getAttribute("data-mode");
    $("themeSeg").querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.v === th)); });
    $("figSeg").querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.v === (prefs.fig === "bike" ? "bike" : "ball"))); });
    $("qtySeg").querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.v === (prefs.qty === "g" ? "g" : "auto"))); });
    $("mngCount").textContent = custom.length ? custom.length + (custom.length === 1 ? " alimento creado por ti" : " alimentos creados por ti") : "Todavía no creas alimentos";
    var rs = C.rulesStatus(rules); $("rulesCount").textContent = "Opcional · " + rs.done + " de " + rs.total + " anotadas";
    var d = C.PAUTA_DEFAULT; $("paramsTxt").textContent = (P.t === d.t && P.f === d.f && P.r === d.r ? "Valores de referencia" : "Modificados") + " · protegidos";
  }
  $("themeSeg").addEventListener("click", function (e) { var b = e.target.closest("[data-v]"); if (!b) return; S.set(S.KEYS.theme, b.dataset.v); applyTheme(); toast(b.dataset.v === "light" ? "Modo claro activado ☀️" : "Modo Midnight activado ⚡"); });
  $("qtySeg").addEventListener("click", function (e) { var b = e.target.closest("[data-v]"); if (!b) return; prefs.qty = b.dataset.v; S.savePrefs(prefs); renderPerfil(); toast(b.dataset.v === "g" ? "Listo, te propondremos gramos" : "Listo, te propondremos unidades cuando existan"); });
  $("mngFoods").addEventListener("click", function () {
    openSheet('<h3 id="shT">Mis alimentos</h3><ul class="list">' + (custom.length ? custom.map(function (f, i) { return '<li class="li"><div class="main"><span class="nm">' + esc(f.name) + '</span><span class="mt">' + metaTxt(f) + " · " + esc(srcTxt(f)) + '</span></div><button class="ibtn" data-me="' + i + '" aria-label="Editar ' + esc(f.name) + '">' + ico("pencil", "s") + "</button></li>"; }).join("") : '<li class="empty"><p>Todavía no creas alimentos. ¡Cuando quieras!</p></li>') + '</ul><button class="btn btn-primary" id="mNew" style="margin-top:12px">' + ico("plus", "s") + "Nuevo alimento</button>", function (b) {
      b.addEventListener("click", function (e) { var x = e.target.closest("[data-me]"); if (x) qtySheet(custom[+x.dataset.me], null); });
      b.querySelector("#mNew").onclick = function () { foodSheet(null); };
    });
  });
  function rulesSheet() {
    var rs = C.rulesStatus(rules);
    openSheet('<h3 id="shT">Notas del equipo</h3><p class="t2 small" style="margin:0 0 6px">Opcional. Anota lo que indique el equipo para tenerlo a mano. No cambia la fórmula ni bloquea nada.</p><p style="margin:0 0 6px;font-weight:800">' + rs.done + " de " + rs.total + ' confirmadas</p><div>' +
      C.CLINICAL_RULES.map(function (x) { var v = rules[x.id] || {}; var ok = v.ok && String(v.answer || "").trim(); return '<button class="rule set' + (ok ? " ok" : "") + '" data-rule="' + x.id + '" style="min-height:56px"><span class="st">' + (ok ? ico("check", "s") : "") + '</span><span class="tx"><b style="font-weight:650">' + esc(x.q) + '</b><span class="ans">' + (ok ? esc(v.answer) : "Pendiente") + "</span></span></button>"; }).join("") + "</div>", function (b) {
      b.addEventListener("click", function (e) { var x = e.target.closest("[data-rule]"); if (x) ruleSheet(x.dataset.rule); });
    });
  }
  function ruleSheet(id) {
    var x = C.CLINICAL_RULES.filter(function (r) { return r.id === id; })[0], v = rules[id] || {};
    openSheet('<h3 id="shT">' + esc(x.q) + '</h3><label class="f" for="raA" style="margin-top:12px">Respuesta del equipo clínico</label><textarea class="in" id="raA" style="font-family:inherit;font-size:16px" placeholder="Escribe exactamente lo que indicó el equipo">' + esc(v.answer || "") + '</textarea>' +
      '<label class="row" style="margin:12px 0;min-height:44px;cursor:pointer"><input type="checkbox" id="raOk" style="width:22px;height:22px;accent-color:#B8FF3B"' + (v.ok ? " checked" : "") + '><span>Confirmado por el equipo clínico</span></label>' + (v.date ? '<p class="muted small">Última actualización: ' + new Date(v.date).toLocaleDateString("es-CL") + "</p>" : "") +
      '<div class="err" id="raE" role="alert"></div><div class="grid2"><button class="btn btn-secondary" id="raBack">Volver</button><button class="btn btn-primary" id="raSave">Guardar</button></div>', function (b) {
      b.querySelector("#raBack").onclick = rulesSheet;
      b.querySelector("#raSave").onclick = function () {
        var a = b.querySelector("#raA").value.trim(), ok = b.querySelector("#raOk").checked;
        if (ok && !a) { b.querySelector("#raE").textContent = "Para confirmar, escribe la respuesta del equipo."; return; }
        var commit = function () { rules[id] = { answer: a, ok: ok, date: Date.now() }; S.saveRules(rules); renderPerfil(); if (ui.screen === "pauta") compute(); toast(ok ? "Regla confirmada" : "Regla guardada como pendiente", "shield"); rulesSheet(); };
        if (ok && !v.ok) confirmModal({ title: "¿Confirmado por el equipo?", text: "Marca esta regla solo si la respuesta viene del equipo clínico de Diego.", ok: "Sí, confirmar", onOk: function () { commit(); } });
        else commit();
      };
    });
  }
  $("rulesB").addEventListener("click", rulesSheet);
  $("paramsB").addEventListener("click", function () { paramsSheet(false); });
  function paramsSheet(unlocked) {
    var dis = unlocked ? "" : " disabled";
    openSheet('<h3 id="shT">Parámetros médicos</h3><p class="t2 small">' + (unlocked ? "Edición desbloqueada. Cambia solo lo que indicó el equipo médico." : "Protegidos contra cambios accidentales.") + "</p>" +
      '<label class="f" for="pT">Glucosa objetivo</label><div class="inp"><input id="pT" inputmode="decimal" value="' + dec(P.t) + '"' + dis + "><span>mg/dL</span></div>" +
      '<label class="f" for="pF" style="margin-top:10px">Factor de sensibilidad</label><div class="inp"><input id="pF" inputmode="decimal" value="' + dec(P.f) + '"' + dis + "><span>mg/dL</span></div>" +
      '<p class="t2 small" style="margin-top:12px"><b>Ratios por comida indicados por la doctora:</b> Desayuno 1:18 · Almuerzo 1:22 · Once 1:20 · Cena 1:22 · Colaciones sin insulina. No se editan con el ratio global antiguo.</p>' +
      '<div class="err" id="pE" role="alert"></div>' + (unlocked ? '<button class="btn btn-primary" id="pSave" style="margin-top:12px">Guardar parámetros</button><button class="btn btn-ghost" id="pReset" style="margin-top:8px">Volver a la epicrisis (110 · 50 · 12)</button>' : '<button class="btn btn-secondary" id="pUnlock" style="margin-top:12px">' + ico("lock", "s") + "Desbloquear edición</button>"), function (b) {
      var u = b.querySelector("#pUnlock"); if (u) u.onclick = function () { confirmModal({ title: "¿Desbloquear parámetros?", text: "Cambiarlos afecta todos los cálculos. Hazlo solo si el equipo médico indicó una pauta nueva.", ok: "Desbloquear", onOk: function () { paramsSheet(true); } }); };
      var sv = b.querySelector("#pSave"); if (sv) sv.onclick = function () {
        var t = C.num(b.querySelector("#pT").value), f = C.num(b.querySelector("#pF").value), r = 18;
        if (!(t >= 60 && t <= 200 && f > 0 && f <= 300)) { b.querySelector("#pE").textContent = "Revisa los valores: objetivo 60–200 y sensibilidad mayor que 0."; return; }
        P = { t: t, f: f, r: r }; S.savePauta(P); closeSheet(); renderPerfil(); renderParams(); toast("Parámetros guardados", "lock");
      };
      var rs = b.querySelector("#pReset"); if (rs) rs.onclick = function () { P = Object.assign({}, C.PAUTA_DEFAULT); try { localStorage.removeItem(S.KEYS.pauta); } catch (e) {} closeSheet(); renderPerfil(); renderParams(); toast("Valores de referencia restaurada", "lock"); };
    });
  }
  function fichaSheet() {
    var kv = function (k, v) { return '<div class="kv"><span>' + k + "</span><b>" + v + "</b></div>"; }, sect = function (t) { return '<div class="sect" style="margin-top:16px">' + t + "</div>"; };
    openSheet('<h3 id="shT">Mi ficha de tratamiento</h3><p class="t2 small" style="margin:0 0 4px">Diabetes tipo 1. Lo que indica tu equipo médico; si te cambian algo, manda lo que diga el equipo.</p>' +
      sect("Insulinas") + kv("Tresiba (basal)", "12 U · 20:00 todos los días") + kv("Fiasp (rápida)", "Según indicación médica solo en comidas que correspondan; colaciones sin insulina") +
      sect("Parámetros de cálculo") + kv("Desayuno", "Ratio 1:18") + kv("Almuerzo", "Ratio 1:22") + kv("Once", "Ratio 1:20") + kv("Cena", "Ratio 1:22") + kv("Colaciones", "Sin insulina") + kv("Sensibilidad", "1 U baja ~" + dec(P.f) + " mg/dL") + kv("Glucosa objetivo", dec(P.t) + " mg/dL") +
      '<p class="t2 small" style="margin:8px 0 0">Dosis = (glicemia − ' + dec(P.t) + ") ÷ " + dec(P.f) + " + HC ÷ ratio de la comida (20 o 22). No calcular bolos para colación.</p>" +
      sect("Carbohidratos por comida") + C.MEALS.map(function (m) { return kv(m.name, m.hc + " g HC · " + (C.ratioForMeal(m.id) == null ? "Sin insulina" : "Ratio 1:" + C.ratioForMeal(m.id))); }).join("") +
      '<p class="t2 small" style="margin:6px 0 0">La colación no lleva insulina. Cualquier cálculo de la app debe verificarse con la pauta médica.</p>' +
      sect("Controles de glicemia") + '<p class="t2" style="margin:0">Antes de desayuno, almuerzo, once y cena; 2 h después de cada una; y a las 02:00.</p>' +
      sect("Otros") + kv("Vitamina D", "5 gotas al día, con el desayuno") +
      sect("Cambios indicados por el equipo") + kv("14-11-2026", "Tresiba de 15 a 14 U") + kv("15-11-2026", "Ratio de 12 a 14 g") + kv("17-11-2026", "Ratio de 14 a 16 g") + kv("19-11-2026 (tarde)", "Ratio de 16 a 14 g; Tresiba de 14 a 12 U") + kv("19-11-2026 (noche)", "Ratio de 14 a 18 g; Tresiba sin cambio (12 U)") + kv("22-11-2026", "Ratio de 18 a 20 g; Tresiba sin cambio (12 U)") + kv("23-11-2026", "Desayuno 1:20; almuerzo, once y cena 1:22; colaciones sin insulina; Tresiba 12 U") + kv("23-11-2026 (última confirmación)", "Desayuno 1:18; almuerzo 1:22; once 1:20; cena 1:22; colaciones sin insulina; Tresiba 12 U") +
      sect("Hipoglucemia (bajo 70)") + note("warn", "Consciente y puede tragar", "15 g de azúcar rápida (jugo o bebida normal, 1 cda. de azúcar en agua). Medir a los 15 min y repetir si sigue bajo 70. Luego algo con carbohidrato lento. Si el sensor no coincide con cómo se siente, confirmar con capilar.") +
      note("danger", "Inconsciente, convulsiona o no puede tragar", "No darle nada por la boca. Ponerlo de lado, usar glucagón si hay y llevarlo a la clínica o llamar al 131 (SAMU)."));
  }
  $("pautaB").addEventListener("click", fichaSheet);
  if ($("fichaB2")) $("fichaB2").addEventListener("click", fichaSheet);
  // Respaldo
  $("exportB").addEventListener("click", function () {
    var data = JSON.stringify(S.exportAll(), null, 1);
    openSheet('<h3 id="shT">Guardemos una copia 💾</h3><p class="t2 small">Incluye tus alimentos, recetas, comidas de siempre, plato e historial. No incluye parámetros médicos ni reglas clínicas.</p><div class="grid2" style="margin-top:12px"><button class="btn btn-primary" id="eDl">' + ico("download", "s") + 'Descargar</button><button class="btn btn-secondary" id="eCp">' + ico("copy", "s") + "Copiar</button></div>", function (b) {
      b.querySelector("#eDl").onclick = function () { try { var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([data], { type: "application/json" })); a.download = "respaldo-diego-" + new Date().toISOString().slice(0, 10) + ".json"; document.body.appendChild(a); a.click(); a.remove(); toast("¡Respaldo listo! Guárdalo en un lugar seguro", "download"); } catch (e) { toast("No se pudo descargar; usa Copiar", "info"); } };
      b.querySelector("#eCp").onclick = function () { try { navigator.clipboard.writeText(data).then(function () { toast("¡Respaldo copiado!", "copy"); }, function () { toast("No se pudo copiar", "info"); }); } catch (e) { toast("No se pudo copiar", "info"); } };
    });
  });
  $("importB").addEventListener("click", function () {
    openSheet('<h3 id="shT">Recuperar una copia</h3><p class="t2 small">Elige el archivo .json o pega su contenido. Lo revisamos antes de guardar y se suma a lo que ya tienes (no borra nada).</p><input type="file" id="iF" accept="application/json,.json" class="in s" style="padding:12px" aria-label="Archivo de respaldo"><label class="f" for="iT" style="margin-top:10px">O pega el respaldo</label><textarea class="in" id="iT"></textarea><div id="iR" style="margin-top:10px"></div><button class="btn btn-secondary" id="iV" style="margin-top:10px">Validar</button>', function (b) {
      var valid = null;
      b.querySelector("#iF").onchange = function () { var f = this.files[0]; if (!f) return; f.text().then(function (t) { b.querySelector("#iT").value = t; }); };
      b.querySelector("#iV").onclick = function () {
        var obj; try { obj = JSON.parse(b.querySelector("#iT").value); } catch (e) { b.querySelector("#iR").innerHTML = note("danger", "No se pudo leer", "El contenido no es un respaldo válido (JSON)."); return; }
        var v = S.validateImport(obj);
        if (!v.ok) { b.querySelector("#iR").innerHTML = note("danger", "Respaldo no válido", esc(v.errors.join(" "))); return; }
        valid = v;
        b.querySelector("#iR").innerHTML = note("info", "Respaldo válido", v.counts.custom + " alimentos · " + v.counts.recipes + " recetas · " + v.counts.favs + " favoritas · " + v.counts.history + " registros" + (v.errors.length ? "<br>" + esc(v.errors.length + " elementos inválidos se omitirán.") : "")) + '<button class="btn btn-primary" id="iGo" style="margin-top:10px">Importar y combinar</button>';
        b.querySelector("#iGo").onclick = function () { S.mergeImport(valid.data); custom = S.loadCustom(); recipes = S.loadRecipes(); favs = S.loadFavs(); hist = S.loadHistory(); closeSheet(); renderPerfil(); toast("¡Datos recuperados! Todo en su lugar", "upload"); };
      };
    });
  });

  /* ================= HORARIOS Y ALARMAS ================= */
  function sched() { return Array.isArray(prefs.schedule) && prefs.schedule.length ? prefs.schedule : C.SCHEDULE_DEFAULT.map(function (x) { return Object.assign({}, x); }); }
  var lastNext = null;
  function renderNext() {
    var n = C.nextEvent(new Date(), sched()); if (!n) { $("nextPill").innerHTML = ""; return; }
    $("nextPill").innerHTML = ico(n.item.basal ? "drop" : "clock") + '<span class="nx">Próxima: <b>' + esc(n.item.label.replace(" (basal)", "")) + " · " + n.item.t + '</b></span><span class="cd">' + (n.minutes <= 1 ? "¡ahora!" : "en " + C.fmtDur(n.minutes)) + "</span>";
    $("nextPill").classList.toggle("soon", n.minutes <= 30);
    $("nextPill").setAttribute("aria-label", "Próximo: " + n.item.label + " a las " + n.item.t + ", en " + C.fmtDur(n.minutes) + ". Toca para editar horarios");
    var key = n.item.t + n.item.id;
    if (lastNext && lastNext !== key) { // pasó la hora del evento anterior mientras la app estaba abierta
      var prev = sched().filter(function (x) { return x.t + x.id === lastNext; })[0];
      if (prev) { toast(prev.basal ? "Hora de la Tresiba (basal)" : "¡Hora " + (prev.id === "once" ? "de la once" : prev.id === "colacion" ? "de la colación" : "del " + prev.label.toLowerCase()) + ", Diego! 🍽️" + (prev.id === "desayuno" ? " Y tus gotitas 💧" : ""), "clock"); if (prev.id === "desayuno") renderInicio(); try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) {} }
    }
    lastNext = key;
  }
  function scheduleSheet() {
    var list = sched(), n = C.nextEvent(new Date(), list);
    openSheet('<h3 id="shT">Horarios y alarmas ⏰</h3><p class="t2 small" style="margin:0 0 6px">Ajusta las horas si cambian. El contador de Inicio usa este horario.</p><div id="schL">' +
      list.map(function (x, i) { var hh = x.t.split(":")[0], mm = x.t.split(":")[1]; var p2 = function (v) { return (v < 10 ? "0" : "") + v; };
        var hs = ""; for (var h = 0; h < 24; h++) hs += '<option' + (p2(h) === hh ? " selected" : "") + ">" + p2(h) + "</option>";
        var ms = ""; for (var m = 0; m < 60; m += 5) ms += '<option' + (p2(m) === mm ? " selected" : "") + ">" + p2(m) + "</option>";
        return '<div class="sched' + (n && n.item === list[i] ? " nx" : "") + '"><div class="tm row" style="gap:4px"><select class="in" data-h="' + i + '" aria-label="Hora de ' + esc(x.label) + '">' + hs + '</select><b>:</b><select class="in" data-m="' + i + '" aria-label="Minutos de ' + esc(x.label) + '">' + ms + '</select></div><span class="lb">' + esc(x.label) + "</span></div>"; }).join("") +
      '</div><div class="grid2" style="margin-top:12px"><button class="btn btn-secondary" id="schReset">Horario original</button><button class="btn btn-primary" id="schSave">Guardar horario</button></div>' +
      '<div class="sect" style="margin-top:18px">Alarmas en el iPhone</div><p class="t2 small" style="margin:0 0 10px">Crea eventos diarios en el Calendario con aviso 10 minutos antes y a la hora exacta. Funcionan aunque la app esté cerrada. Hazlo en el iPhone de Diego.</p><button class="btn btn-primary" id="schIcs">' + ico("calendar", "s") + "Agregar alarmas al Calendario</button>", function (b) {
      function read() { return list.map(function (x, i) { return Object.assign({}, x, { t: b.querySelector('[data-h="' + i + '"]').value + ":" + b.querySelector('[data-m="' + i + '"]').value }); }); }
      b.querySelector("#schSave").onclick = function () { prefs.schedule = read(); S.savePrefs(prefs); if (mealSelectionMode === "automatic") selectNextMealIfSafe(); renderNext(); if (ui.screen === "inicio") renderInicio(); closeSheet(); toast("¡Horario guardado! ⏰", "clock"); };
      b.querySelector("#schReset").onclick = function () { delete prefs.schedule; S.savePrefs(prefs); if (mealSelectionMode === "automatic") selectNextMealIfSafe(); renderNext(); if (ui.screen === "inicio") renderInicio(); scheduleSheet(); toast("Volvimos al horario original", "clock"); };
      b.querySelector("#schIcs").onclick = function () {
        var cur = read(), txt = C.icsFor(cur, new Date());
        try { var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([txt], { type: "text/calendar" })); a.download = "alarmas-diego.ics"; document.body.appendChild(a); a.click(); a.remove(); toast("Abre el archivo y toca \"Agregar todo\"", "calendar"); }
        catch (e) { toast("No se pudo crear el archivo", "info"); }
      };
    });
  }
  $("nextPill").addEventListener("click", scheduleSheet);
  var editSchedule = $("editSchedule"); if (editSchedule) editSchedule.addEventListener("click", scheduleSheet);
  $("schedB").addEventListener("click", scheduleSheet);
  setInterval(function () { renderNext(); }, 30000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) { lastNext = null; if (mealSelectionMode === "automatic" && !plate.items.length) { selectNextMealIfSafe(); if (ui.screen === "inicio") renderInicio(); } renderNext(); } });

  /* ================= HISTORIAL ================= */
  function fdt(t) { var d = new Date(t); return d.toLocaleDateString("es-CL", { weekday: "short", day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }); }
  function line(h) { return (h.meal ? h.meal + " · " : "") + "Glicemia " + h.g + (h.src === "capilar" ? " (capilar)" : "") + " · HC " + fmt(h.c) + " g · " + (h.hypo ? "Hipoglucemia, sin dosis" : h.dose == null ? "Resultado bloqueado" : "Fórmula " + dec2(h.dose) + " U") + (h.ap != null ? " · Aplicada " + dec(h.ap) + " U" : "") + (h.recent ? " · bolo <3 h" : "") + (h.sport ? " · ejercicio" : ""); }
  function renderHist() {
    hist = S.loadHistory();
    $("hist").innerHTML = hist.length ? hist.map(function (h, i) { var rg = C.glucoseRange(+h.g), id = rg ? rg.id : ""; var bc = id === "low" ? "var(--danger)" : (id === "high" || id === "vhigh") ? "var(--warning)" : "var(--border2)"; return '<li class="li"><div class="main" style="border-left:3px solid ' + bc + ';padding-left:10px"><span class="mt">' + fdt(h.t) + (rg ? " · " + rg.label : "") + '</span><span style="display:block">' + esc(line(h)) + '</span></div><button class="ibtn" data-hd="' + i + '" aria-label="Borrar registro">' + ico("trash", "s") + "</button></li>"; }).join("") : '<li class="empty">' + ico("clock") + '<p>Aún no hay registros.<br>Cuando guardes uno en Pauta, aparece aquí.</p></li>';
  }
  $("hist").addEventListener("click", function (e) { var b = e.target.closest("[data-hd]"); if (!b) return; hist.splice(+b.dataset.hd, 1); S.saveHistory(hist); renderHist(); toast("Registro borrado", "trash"); });
  $("copyH").innerHTML = ico("copy", "s") + "Copiar";
  $("copyH").addEventListener("click", function () { var txt = "Historial diego.\n" + hist.map(function (h) { return fdt(h.t) + " — " + line(h); }).join("\n"); try { navigator.clipboard.writeText(txt).then(function () { toast("Historial copiado. Listo para compartir", "copy"); }, function () { toast("No se pudo copiar", "info"); }); } catch (e) { toast("No se pudo copiar", "info"); } });
  $("clrH").addEventListener("click", function () { if (!hist.length) return; confirmModal({ title: "¿Borramos todo el historial?", text: "Se eliminan " + hist.length + " registros de este teléfono. No se puede deshacer.", ok: "Sí, borrar todo", danger: true, onOk: function () { hist = []; S.saveHistory(hist); renderHist(); toast("Historial borrado", "trash"); } }); });

  /* ================= Tema ================= */
  function applyFig() { document.documentElement.classList.toggle("fig-ball", prefs.fig !== "bike"); }
  $("figSeg").addEventListener("click", function (e) { var b = e.target.closest("[data-v]"); if (!b) return; prefs.fig = b.dataset.v; S.savePrefs(prefs); applyFig(); toast(b.dataset.v === "ball" ? "Pelota activada ⚽" : "Ciclista activado 🚴"); });
  function applyTheme() {
    var t = S.get(S.KEYS.theme, null) || "dark";
    document.documentElement.setAttribute("data-mode", t === "light" ? "light" : "dark");
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = t === "light" ? "#F3F5F9" : "#0B1020";
  }

  applyTheme(); applyFig();
  show((location.hash || "#inicio").slice(1), false);
  if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) navigator.serviceWorker.register("sw.js").catch(function () {});
})();
