/* calc.js — Lógica pura (sin DOM). Pauta de Diego.
   Contiene: base de alimentos, cálculo de carbohidratos, recetas y fórmula de la pauta.
   No cambiar parámetros médicos aquí sin indicación del equipo. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Calc = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Ratios comunicados por la familia el 24/11/2026: 1:22 en las cuatro comidas. Tresiba 12 U según pauta previamente informada. Confirmar con el equipo tratante antes de dosificar. t = objetivo, f = sensibilidad, r = ratio.
  var PAUTA_DEFAULT = Object.freeze({ t: 110, f: 50, r: 22 });
  // Pauta comunicada el 23/11/2026: la colación NO lleva insulina.
  var MEAL_RATIOS = Object.freeze({ desayuno: 22, colacion: null, almuerzo: 22, once: 22, cena: 22 });
  var RATIO_STORAGE = "diego.v35.clinicalRatios";
  function currentRatios() {
    var r = Object.assign({}, MEAL_RATIOS);
    try {
      var val = JSON.parse(localStorage.getItem(RATIO_STORAGE) || 'null');
      if (val && typeof val === 'object') ['desayuno','almuerzo','once','cena'].forEach(function(k){
        var n = Number(val[k]); if (Number.isInteger(n) && n >= 5 && n <= 60) r[k] = n;
      });
    } catch(e) {}
    return r;
  }
  function ratioForMeal(id) { var ratios = currentRatios(); return Object.prototype.hasOwnProperty.call(ratios, id) ? ratios[id] : null; }

  // Carbohidratos objetivo por comida según la pauta (g).
  var MEALS = Object.freeze([
    { id: "desayuno", name: "Desayuno", hc: 60 },
    { id: "colacion", name: "Colación", hc: 20 },
    { id: "almuerzo", name: "Almuerzo", hc: 65 },
    { id: "once", name: "Once", hc: 60 },
    { id: "cena", name: "Cena", hc: 65 }
  ]);

  // Base de alimentos existente (la misma de la versión anterior).
  // [nombre, g de HC por 100 g o 100 ml, peso por unidad en g (opcional)]
  var FOODS = {
    "Frutas": [["Manzana", 13.8], ["Plátano pesado (sin cáscara)", 22.8], ["Medio plátano (mitad)", 22.8, 59], ["Naranja", 11.8], ["Mandarina", 13.3], ["Piña", 13.1], ["Palta", 8.5]],
    "Verduras": [["Tomate", 3.9], ["Tomate mediano (unidad)", 3.9, 123], ["Tomate cherry", 3.9]],
    "Huevos": [["Huevo (unidad)", 0.7, 50]],
    "Lácteos": [["Yoghito vainilla sin azúcar (120 g)", 7.4, 120], ["Queso mantecoso / gauda", 1], ["Helado de crema", 23.6]],
    "Panes y cereales": [["Marraqueta", 58], ["Hallulla", 55], ["Pan de molde blanco", 49], ["Corn flakes", 84], ["Galletas de soda", 71]],
    "Acompañamientos": [["Fideos secos (pesar antes de cocinar)", 70], ["Papa cocida", 20], ["Puré de papas", 16], ["Puré mamá", 17.3], ["Papas fritas", 41]],
    "Bebidas": [["Té o infusión sin azúcar (taza de 200 ml)", 0, 200], ["Té con 1 cucharadita de azúcar (taza de 200 ml)", 2, 200], ["Vivo Néctar de Piña (190 ml)", 3.3684210526, 190], ["Jugo Del Valle (400 ml)", 4.9, 400], ["Jugo de naranja natural", 10.4], ["Néctar de fruta (aprox.)", 12]]
  };

  // Estado y fuente de cada alimento base (no cambia los valores).
  var STATE = { "Fideos secos (pesar antes de cocinar)": "crudo", "Papa cocida": "cocido", "Puré de papas": "preparado", "Puré mamá": "preparado", "Papas fritas": "preparado" };
  var SOURCE = { "Fideos secos (pesar antes de cocinar)": "Referencia provisional: 70 g HC por 100 g de pasta seca; confirmar etiqueta de la marca",  "Té o infusión sin azúcar (taza de 200 ml)": "Té preparado solo con agua; sin azúcar ni ingredientes con HC", "Té con 1 cucharadita de azúcar (taza de 200 ml)": "Estimación: una cucharadita rasa de azúcar de 4 g, aporta aproximadamente 4 g HC",  "Yoghito vainilla sin azúcar (120 g)": "Etiqueta Soprole", "Puré mamá": "Receta casera calculada (820 g)", "Vivo Néctar de Piña (190 ml)": "Etiqueta FatSecret/Vivo: por 1 unidad (190 ml) aporta 28 kcal, 0 g grasa, 6,4 g carbohidratos y 0,2 g proteínas.", "Jugo Del Valle (400 ml)": "Etiqueta Del Valle (19,6 g/botella)" };
  var DEFAULT_SOURCE = "Tabla USDA (aprox.)";

  // Reglas que el equipo clínico debe confirmar antes de mostrar un resultado de dosis.
  var CLINICAL_RULES = Object.freeze([
    { id: "redondeo", q: "Redondeo de la dosis (0,5 U o 1 U)" },
    { id: "insulina-activa", q: "Insulina activa: cuánto esperar tras un bolo antes de corregir" },
    { id: "bajo-objetivo", q: "Glicemia bajo 110: ¿se resta la corrección de la dosis de comida?" },
    { id: "colacion", q: "Confirmar: las colaciones no llevan insulina (indicación comunicada 23/11/2026)" },
    { id: "dosis-maxima", q: "Dosis máxima por bolo y situaciones excepcionales (enfermedad, cetonas)" },
    { id: "ejercicio", q: "Ajustes para fútbol y gimnasio (antes, durante y en la noche)" },
    { id: "sensor-capilar", q: "Cuándo confirmar con glucómetro capilar antes de calcular" }
  ]);
  function rulesStatus(rules) {
    var r = rules || {}, done = CLINICAL_RULES.filter(function (x) { return r[x.id] && r[x.id].ok && String(r[x.id].answer || "").trim(); });
    return { done: done.length, total: CLINICAL_RULES.length, complete: done.length === CLINICAL_RULES.length };
  }

  // Horario del día (definido por la familia). La Tresiba de las 20:00 viene de la pauta.
  var SCHEDULE_DEFAULT = Object.freeze([
    { t: "07:00", id: "desayuno", label: "Desayuno" },
    { t: "10:00", id: "colacion", label: "Colación" },
    { t: "13:00", id: "almuerzo", label: "Almuerzo" },
    { t: "16:00", id: "colacion", label: "Colación" },
    { t: "19:00", id: "once", label: "Once" },
    { t: "20:00", id: "tresiba", label: "Tresiba (basal)", basal: true },
    { t: "22:00", id: "cena", label: "Cena" }
  ]);
  function toMin(t) { var m = /^(\d{1,2}):(\d{2})$/.exec(String(t || "")); return m ? (+m[1]) * 60 + (+m[2]) : NaN; }
  // Próximo evento desde "now" (Date). Devuelve {item, minutes, tomorrow}
  function nextEvent(now, sched) {
    var list = (sched || SCHEDULE_DEFAULT).filter(function (x) { return !isNaN(toMin(x.t)); }).slice().sort(function (a, b) { return toMin(a.t) - toMin(b.t); });
    if (!list.length) return null;
    var cur = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    for (var i = 0; i < list.length; i++) { var d = toMin(list[i].t) - cur; if (d > 0) return { item: list[i], minutes: Math.ceil(d), tomorrow: false }; }
    return { item: list[0], minutes: Math.ceil(toMin(list[0].t) + 1440 - cur), tomorrow: true };
  }
  // Comida con hora más cercana, pasada o futura; incluye cruce de medianoche.
  // No confundir con nextEvent(), que sigue indicando el próximo evento futuro.
  // En empate entre dos comidas, favorece la futura. Ignora Tresiba basal.
  function nextMeal(now, schedule) {
    var allowed = { desayuno: true, colacion: true, almuerzo: true, once: true, cena: true };
    var list = (schedule || SCHEDULE_DEFAULT).filter(function (x) {
      return x && allowed[x.id] && !x.basal && !isNaN(toMin(x.t)) && toMin(x.t) < 1440;
    });
    if (!list.length) return null;
    var current = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    var nearest = null;
    list.forEach(function (x) {
      var difference = toMin(x.t) - current;
      if (difference > 720) difference -= 1440; // ayer es más cercano
      else if (difference < -720) difference += 1440; // mañana es más cercano
      var distance = Math.abs(difference);
      if (!nearest || distance < nearest.minutes ||
          (distance === nearest.minutes && difference >= 0 && nearest.offset < 0)) {
        nearest = { item: x, minutes: distance, offset: difference,
          tomorrow: difference > 0 && toMin(x.t) < current,
          yesterday: difference < 0 && toMin(x.t) > current };
      }
    });
    return nearest;
  }
  function fmtDur(min) { var h = Math.floor(min / 60), m = min % 60; return h ? h + " h" + (m ? " " + m + " min" : "") : m + " min"; }
  // Archivo de calendario (.ics) con eventos diarios y aviso a la hora exacta y 10 min antes
  function icsFor(sched, from) {
    var d = from || new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; };
    var day = d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()), stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
    var L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//diego.//Pauta//ES", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:diego. horarios"];
    (sched || SCHEDULE_DEFAULT).forEach(function (x, i) {
      var mm = toMin(x.t); if (isNaN(mm)) return;
      var t = p(Math.floor(mm / 60)) + p(mm % 60) + "00";
      L.push("BEGIN:VEVENT", "UID:diego-" + x.id + "-" + i + "-" + t + "@pauta", "DTSTAMP:" + stamp, "DTSTART:" + day + "T" + t, "DURATION:PT15M", "RRULE:FREQ=DAILY",
        "SUMMARY:" + (x.basal ? "Tresiba (insulina basal) · diego." : x.label + " · diego."),
        "DESCRIPTION:" + (x.basal ? "Dosis basal según tu pauta." : (x.id === "colacion" ? "Colación sin insulina según la pauta comunicada por la familia." : "Mide la glicemia y sigue la pauta médica antes de comer.") + (x.id === "desayuno" ? " Toma tus 5 gotitas de vitamina D." : "")),
        "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + x.label, "TRIGGER:-PT10M", "END:VALARM",
        "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + x.label + (x.id === "desayuno" ? " + gotitas de vitamina D" : ""), "TRIGGER:PT0M", "END:VALARM", "END:VEVENT");
    });
    L.push("END:VCALENDAR");
    return L.join("\r\n");
  }

  function slug(s) {
    return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  // Lista plana con id estable: {id, name, hc100, unit, cat, kind}
  function baseFoods() {
    var out = [];
    Object.keys(FOODS).forEach(function (cat) {
      FOODS[cat].forEach(function (f) {
        out.push({ id: "b:" + slug(f[0]), name: f[0], hc100: f[1], unit: f[2] || null, cat: cat, kind: "base", state: STATE[f[0]] || (/sin cocer|crud/i.test(f[0]) ? "crudo" : /cocid/i.test(f[0]) ? "cocido" : null), source: SOURCE[f[0]] || DEFAULT_SOURCE });
      });
    });
    return out;
  }

  function num(v) {
    if (typeof v === "number") return v;
    var n = parseFloat(String(v == null ? "" : v).trim().replace(",", "."));
    return n;
  }

  function round1(x) { return Math.round(x * 10) / 10; }

  // Carbohidratos de una porción. qty en gramos/ml, o en unidades si el alimento tiene unit.
  // mode: "u" (unidades) o "g" (gramos). Si no se indica: unidades cuando el alimento tiene peso por unidad.
  function hcFor(food, qty, mode) {
    var q = num(qty);
    if (!food || !(q > 0) || !(food.hc100 >= 0)) return 0;
    var byUnit = mode ? (mode === "u" && food.unit) : !!food.unit;
    var grams = byUnit ? q * food.unit : q;
    return grams * food.hc100 / 100;
  }

  function plateTotal(items) {
    return (items || []).reduce(function (a, it) { return a + (it.hc || 0); }, 0);
  }

  // Receta: ingredientes [{name, hc100, grams}], peso final real de la preparación.
  function recipe(ingredients, finalWeight) {
    var fw = num(finalWeight);
    var total = (ingredients || []).reduce(function (a, i) {
      var g = num(i.grams), c = num(i.hc100);
      return a + ((g > 0 && c >= 0) ? g * c / 100 : 0);
    }, 0);
    var rawWeight = (ingredients || []).reduce(function (a, i) { var g = num(i.grams); return a + (g > 0 ? g : 0); }, 0);
    return { totalHC: total, rawWeight: rawWeight, finalWeight: fw > 0 ? fw : null, per100: fw > 0 ? total / fw * 100 : null };
  }

  function glucoseRange(g) {
    if (!(g >= 0)) return null;
    if (g < 70) return { id: "low", label: "Baja" };
    if (g <= 180) return { id: "ok", label: "En rango" };
    if (g <= 250) return { id: "high", label: "Alta" };
    return { id: "vhigh", label: "Muy alta" };
  }

  /* Fórmula de la pauta: (glicemia − objetivo) ÷ sensibilidad + HC ÷ ratio.
     Lógica idéntica a la versión anterior:
     - glicemia < 70: hipoglucemia, sin dosis.
     - insulina rápida reciente: se advierte el riesgo, sin modificar la ecuación escrita.
     - resultado negativo se muestra como 0.
     Devuelve también los avisos que la interfaz debe mostrar. */
  function dose(input) {
    var P = input.P || PAUTA_DEFAULT;
    var g = num(input.g), c = num(input.c);
    var res = { valid: false, hypo: false, corr: null, food: null, total: null, main: null, mode: "full", warnings: [], range: glucoseRange(g) };
    if (isNaN(g)) { res.reason = "sin-glicemia"; return res; }
    if (g < 70) { res.hypo = true; res.valid = true; res.main = 0; res.warnings.push("hipo"); return res; }
    var cc = isNaN(c) ? 0 : c;
    res.corr = (g - P.t) / P.f;
    res.food = cc / P.r;
    res.total = res.corr + res.food;
    var main = res.total;
    if (input.recent) res.warnings.push("bolo-reciente");
    if (res.corr < 0) res.warnings.push("bajo-objetivo");
    if (main < 0) main = 0;
    res.main = main;
    res.valid = true;
    if (input.sport) res.warnings.push("deporte");
    if (g >= 250) res.warnings.push("cetonas");
    if (main > 15) res.warnings.push("dosis-alta");
    if (isNaN(c)) res.warnings.push("sin-hc");
    if (input.sym) res.warnings.push("sintomas");
    return res;
  }

  function fmt(x, d) {
    if (x == null || isNaN(x)) return "—";
    return round1(x).toLocaleString("es-CL", { minimumFractionDigits: d == null ? 1 : d, maximumFractionDigits: 1 });
  }

  return {
    PAUTA_DEFAULT: PAUTA_DEFAULT, MEAL_RATIOS: MEAL_RATIOS, currentRatios: currentRatios, ratioForMeal: ratioForMeal, MEALS: MEALS, FOODS: FOODS,
    baseFoods: baseFoods, slug: slug, num: num, round1: round1,
    SCHEDULE_DEFAULT: SCHEDULE_DEFAULT, nextMeal: nextMeal, toMin: toMin, nextEvent: nextEvent, fmtDur: fmtDur, icsFor: icsFor, hcFor: hcFor, CLINICAL_RULES: CLINICAL_RULES, rulesStatus: rulesStatus, plateTotal: plateTotal, recipe: recipe, glucoseRange: glucoseRange, dose: dose, fmt: fmt
  };
});
