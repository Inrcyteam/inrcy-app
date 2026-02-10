/* iNrCy Actus Widget v1 */
(function () {
  function qsa(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeDomain(input) {
    var raw = (input || "").trim();
    if (!raw) return "";
    try {
      var withProto = /^https?:\/\//i.test(raw) ? raw : "https://" + raw;
      var u = new URL(withProto);
      return u.hostname.replace(/^www\./i, "");
    } catch (e) {
      return raw
        .replace(/^https?:\/\//i, "")
        .split("/")[0]
        .replace(/^www\./i, "");
    }
  }

  function getScriptOrigin() {
    var s = document.currentScript;
    if (!s) {
      var scripts = document.getElementsByTagName("script");
      s = scripts[scripts.length - 1];
    }
    try {
      return new URL(s.src).origin;
    } catch (e) {
      return "";
    }
  }

  function mount(el) {
    var domain = normalizeDomain(
      el.getAttribute("data-domain") || window.location.hostname || ""
    );
    var source = el.getAttribute("data-source") || ""; // site_inrcy | site_web | (auto)
    var limit = parseInt(el.getAttribute("data-limit") || "5", 10);
    if (isNaN(limit) || limit <= 0) limit = 5;

    var title = el.getAttribute("data-title") || "Actualités";

    if (!domain) return;

    var origin = getScriptOrigin();
    if (!origin) {
      el.innerHTML =
        '<div style="font:14px/1.4 system-ui, -apple-system, Segoe UI, Roboto, Arial; color:#b91c1c;">Widget iNrCy : origine du script introuvable.</div>';
      return;
    }

    var url = origin + "/api/widgets/actus?domain=" + encodeURIComponent(domain) + "&limit=" + encodeURIComponent(String(limit));
    if (source) url += "&source=" + encodeURIComponent(source);

    el.innerHTML =
      '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial; color:#0f172a;">' +
      '  <div style="font-weight:700; font-size:18px; margin:0 0 10px 0;">' +
      escapeHtml(title) +
      "</div>" +
      '  <div data-inrcy-actus-loading style="opacity:.75; font-size:14px;">Chargement…</div>' +
      "</div>";

    fetch(url, { method: "GET" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        var items = (data && data.items) || [];
        if (!items.length) {
          el.innerHTML =
            '<div style="font:14px/1.4 system-ui,-apple-system,Segoe UI,Roboto,Arial; color:#334155;">Aucune actualité pour le moment.</div>';
          return;
        }

        var html =
          '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial; color:#0f172a;">' +
          '  <div style="font-weight:700; font-size:18px; margin:0 0 10px 0;">' +
          escapeHtml(title) +
          "</div>" +
          '  <div style="display:grid; gap:10px;">';

        for (var i = 0; i < items.length; i++) {
          var it = items[i] || {};
          var d = it.created_at ? new Date(it.created_at) : null;
          var dateStr = d && !isNaN(d.getTime()) ? d.toLocaleDateString() : "";
          html +=
            '<div style="border:1px solid rgba(15,23,42,.12); border-radius:14px; padding:12px 14px; background:rgba(255,255,255,.7); backdrop-filter: blur(6px);">' +
            '  <div style="font-weight:700; font-size:15px; margin:0 0 6px 0;">' +
            escapeHtml(it.title || "") +
            "</div>" +
            (dateStr
              ? '<div style="font-size:12px; opacity:.65; margin:0 0 6px 0;">' +
                escapeHtml(dateStr) +
                "</div>"
              : "") +
            '  <div style="font-size:14px; line-height:1.45; opacity:.92;">' +
            escapeHtml(it.content || "") +
            "</div>" +
            "</div>";
        }

        html += "</div></div>";
        el.innerHTML = html;
      })
      .catch(function (e) {
        el.innerHTML =
          '<div style="font:14px/1.4 system-ui,-apple-system,Segoe UI,Roboto,Arial; color:#b91c1c;">Widget iNrCy : impossible de charger les actus (' +
          escapeHtml(String(e && e.message ? e.message : e)) +
          ").</div>";
      });
  }

  function init() {
    qsa("[data-inrcy-actus]").forEach(mount);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
