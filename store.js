/* store.js — Persistencia local (solo en este teléfono). Sin DOM.
   Mantiene las claves de la versión anterior para no perder datos:
   diegoPauta, diegoHistorial, diegoAlimentos (se migra a la estructura nueva). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Store = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var KEYS = {
    pauta: "diegoPauta",          // versión anterior
    history: "diegoHistorial",    // versión anterior
    legacyCustom: "diegoAlimentos", // versión anterior: [[nombre, hc100], ...]
    custom: "diego.v2.custom",
    recipes: "diego.v2.recipes",
    favs: "diego.v2.favs",
    plate: "diego.v2.plate",
    usage: "diego.v2.usage",
    theme: "diego.v2.theme",
    recent: "diego.v3.recent",
    favFoods: "diego.v3.favFoods",
    rules: "diego.v3.rules",
    prefs: "diego.v3.prefs"
  };

  function memoryStorage() {
    var m = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
      setItem: function (k, v) { m[k] = String(v); },
      removeItem: function (k) { delete m[k]; }
    };
  }

  function slug(s) {
    return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function create(storage) {
    var st = storage;
    if (!st) { try { st = window.localStorage; st.getItem("x"); } catch (e) { st = memoryStorage(); } }

    function get(key, def) {
      try { var v = st.getItem(key); return v == null ? def : JSON.parse(v); } catch (e) { return def; }
    }
    function set(key, val) {
      try { st.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; }
    }

    // Alimentos personalizados: {id, name, hc100, unit, cat:"Mis alimentos", kind:"custom"}
    function loadCustom() {
      var cur = get(KEYS.custom, null);
      if (Array.isArray(cur)) return cur;
      var legacy = get(KEYS.legacyCustom, []);
      var migrated = (Array.isArray(legacy) ? legacy : []).filter(function (x) { return Array.isArray(x) && x[0]; }).map(function (x) {
        return { id: "m:" + slug(x[0]), name: String(x[0]), hc100: Number(x[1]), unit: x[2] ? Number(x[2]) : null, cat: "Mis alimentos", kind: "custom" };
      });
      set(KEYS.custom, migrated);
      return migrated;
    }
    function saveCustom(list) { return set(KEYS.custom, list); }

    function upsertCustom(list, food) {
      var id = "m:" + slug(food.name);
      var item = { id: id, name: food.name.trim(), hc100: Number(food.hc100), unit: food.unit ? Number(food.unit) : null, cat: "Mis alimentos", kind: "custom", source: food.source || null };
      var out = list.filter(function (f) { return f.id !== id; });
      out.push(item);
      return out;
    }

    return {
      KEYS: KEYS, get: get, set: set,
      loadCustom: loadCustom, saveCustom: saveCustom, upsertCustom: upsertCustom,
      loadPauta: function (def) { var p = get(KEYS.pauta, null); return (p && p.t > 0 && p.f > 0 && p.r > 0) ? p : Object.assign({}, def); },
      savePauta: function (p) { return set(KEYS.pauta, p); },
      loadHistory: function () { var h = get(KEYS.history, []); return Array.isArray(h) ? h : []; },
      saveHistory: function (h) { return set(KEYS.history, h.slice(0, 300)); },
      loadRecipes: function () { var r = get(KEYS.recipes, []); return Array.isArray(r) ? r : []; },
      saveRecipes: function (r) { return set(KEYS.recipes, r); },
      loadFavs: function () { var r = get(KEYS.favs, []); return Array.isArray(r) ? r : []; },
      saveFavs: function (r) { return set(KEYS.favs, r); },
      loadPlate: function () { var p = get(KEYS.plate, null); return (p && Array.isArray(p.items)) ? p : { meal: "desayuno", items: [] }; },
      savePlate: function (p) { return set(KEYS.plate, p); },
      loadUsage: function () { return get(KEYS.usage, {}) || {}; },
      saveUsage: function (u) { return set(KEYS.usage, u); },
      loadList: function (k) { var v = get(KEYS[k], []); return Array.isArray(v) ? v : []; },
      saveList: function (k, v) { return set(KEYS[k], v); },
      loadRules: function () { var v = get(KEYS.rules, {}); return (v && typeof v === "object" && !Array.isArray(v)) ? v : {}; },
      saveRules: function (v) { return set(KEYS.rules, v); },
      loadPrefs: function () { var v = get(KEYS.prefs, {}); return Object.assign({ qty: "auto" }, (v && typeof v === "object") ? v : {}); },
      savePrefs: function (v) { return set(KEYS.prefs, v); },
      exportAll: function () {
        var d = {}; ["custom", "recipes", "favs", "plate", "usage", "recent", "favFoods", "history", "prefs"].forEach(function (k) { d[k] = get(KEYS[k], null); });
        d.custom = loadCustom();
        return { app: "pauta-diego", version: 3, exported: new Date().toISOString(), data: d };
      },
      // Valida un respaldo y devuelve {ok, errors, counts, data}. No incluye parámetros médicos ni reglas clínicas.
      validateImport: function (obj) {
        var errors = [], d = obj && obj.data;
        if (!obj || obj.app !== "pauta-diego" || !d || typeof d !== "object") return { ok: false, errors: ["No es un respaldo de Pauta de Diego."] };
        function arr(k, check) { if (d[k] == null) return []; if (!Array.isArray(d[k])) { errors.push(k + " no es una lista"); return []; } return d[k].filter(function (x) { var ok = check(x); if (!ok) errors.push("Se omitió un elemento inválido en " + k); return ok; }); }
        var isNum = function (x) { return typeof x === "number" && isFinite(x); };
        var clean = {
          custom: arr("custom", function (x) { return x && typeof x.name === "string" && x.name.trim() && isNum(Number(x.hc100)) && x.hc100 >= 0 && x.hc100 <= 100; }),
          recipes: arr("recipes", function (x) { return x && x.id && typeof x.name === "string" && Array.isArray(x.ingredients) && Number(x.finalWeight) > 0; }),
          favs: arr("favs", function (x) { return x && x.id && typeof x.name === "string" && Array.isArray(x.items); }),
          history: arr("history", function (x) { return x && isNum(x.t) && isNum(Number(x.g)); })
        };
        clean.favs.forEach(function (f) { f.items.forEach(function (it) { delete it.dose; delete it.g; }); });
        return { ok: true, errors: errors, data: clean, counts: { custom: clean.custom.length, recipes: clean.recipes.length, favs: clean.favs.length, history: clean.history.length } };
      },
      mergeImport: function (clean) {
        function byKey(cur, inc, key) { var m = {}; cur.concat(inc).forEach(function (x) { m[x[key]] = x; }); return Object.keys(m).map(function (k) { return m[k]; }); }
        var c = byKey(loadCustom(), clean.custom.map(function (x) { return { id: "m:" + slug(x.name), name: x.name.trim(), hc100: Number(x.hc100), unit: x.unit ? Number(x.unit) : null, cat: "Mis alimentos", kind: "custom", source: x.source || null }; }), "id");
        set(KEYS.custom, c);
        set(KEYS.recipes, byKey(get(KEYS.recipes, []) || [], clean.recipes, "id"));
        set(KEYS.favs, byKey(get(KEYS.favs, []) || [], clean.favs, "id"));
        set(KEYS.history, byKey(get(KEYS.history, []) || [], clean.history, "t").sort(function (a, b) { return b.t - a.t; }).slice(0, 300));
        return true;
      }
    };
  }

  return { create: create, memoryStorage: memoryStorage, KEYS: KEYS };
});
