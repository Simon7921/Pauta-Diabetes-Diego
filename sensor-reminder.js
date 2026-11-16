/* Sensor reminder V18: aviso local dentro de la app, cada 14 días.
   No genera notificaciones push: mostrar solo mientras la app esté abierta. */
(function () {
  "use strict";
  var KEY = "diego.sensor.nextChange.v1";
  var DEFAULT_DATE = "2026-11-24";
  var PERIOD_DAYS = 14;
  var MS = 24 * 60 * 60 * 1000;
  var root = document.getElementById("sensorReminder");
  if (!root) return;
  var status = document.getElementById("sensorStatus");
  var detail = document.getElementById("sensorDateDetail");
  var edit = document.getElementById("sensorEdit");
  var settings = document.getElementById("sensorSettings");
  var dateInput = document.getElementById("sensorNextDate");
  var save = document.getElementById("sensorSave");
  var cancel = document.getElementById("sensorCancel");
  function parseDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
    var p = value.split("-").map(Number);
    var d = new Date(Date.UTC(p[0], p[1]-1, p[2]));
    if (d.getUTCFullYear() !== p[0] || d.getUTCMonth() !== p[1]-1 || d.getUTCDate() !== p[2]) return null;
    return d;
  }
  function isoUTC(date) { return date.toISOString().slice(0,10); }
  function todayUTC() { var d = new Date(); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); }
  function configured() {
    try { var x = localStorage.getItem(KEY); if (parseDate(x)) return x; } catch (e) {}
    return DEFAULT_DATE;
  }
  function getNext(today) {
    var target = parseDate(configured()) || parseDate(DEFAULT_DATE);
    var days = Math.round((target.getTime() - today.getTime()) / MS);
    if (days < 0) {
      var cycles = Math.ceil((-days) / PERIOD_DAYS);
      target = new Date(target.getTime() + cycles * PERIOD_DAYS * MS);
      days = Math.round((target.getTime() - today.getTime()) / MS);
    }
    return {target:target,days:days};
  }
  function pretty(d) { return new Intl.DateTimeFormat("es-CL", {day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}).format(d); }
  function draw() {
    var n = getNext(todayUTC());
    root.classList.toggle("is-soon",n.days >= 1 && n.days <= 3);
    root.classList.toggle("is-today",n.days === 0);
    if (n.days === 0) status.textContent = "Hoy corresponde cambiar el sensor";
    else if (n.days === 1) status.textContent = "Queda 1 día para cambiar el sensor";
    else if (n.days <= 3) status.textContent = "Quedan " + n.days + " días para cambiar el sensor";
    else status.textContent = "Próximo cambio de sensor";
    detail.textContent = pretty(n.target) + " · ciclo de 14 días";
    dateInput.value = isoUTC(n.target);
  }
  function closeSettings() { settings.hidden = true; edit.setAttribute("aria-expanded","false"); }
  edit.addEventListener("click",function(){
    settings.hidden = !settings.hidden;
    edit.setAttribute("aria-expanded",String(!settings.hidden));
    if (!settings.hidden) { dateInput.value = isoUTC(getNext(todayUTC()).target); dateInput.focus(); }
  });
  cancel.addEventListener("click", closeSettings);
  save.addEventListener("click",function(){
    if (!parseDate(dateInput.value)) { dateInput.setCustomValidity("Selecciona una fecha válida"); dateInput.reportValidity(); return; }
    dateInput.setCustomValidity("");
    try {localStorage.setItem(KEY,dateInput.value);} catch(e) {alert("No se pudo guardar la fecha en este dispositivo.");return;}
    closeSettings(); draw();
  });
  dateInput.addEventListener("input",function(){dateInput.setCustomValidity("");});
  draw();
  document.addEventListener("visibilitychange",function(){if (!document.hidden) draw();});
  window.addEventListener("focus",draw);
  setInterval(function(){if (!document.hidden) draw();},60000);
  window.DiegoSensorReminder = {nextForDate:function(iso){var t=parseDate(iso);return t?getNext(t):null;}};
})();
