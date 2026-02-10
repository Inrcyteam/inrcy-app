(function () {
  "use strict";

  function normalizeDomain(input) {
    if (!input) return "";
    var raw = String(input).trim();
    try {
      var url = /^https?:\/\//i.test(raw) ? new URL(raw) : new URL("https://" + raw);
      var host = (url.hostname || "").toLowerCase();
      host = host.replace(/^www\./, "");
      return host;
    } catch (e) {
      // last chance: strip protocol manually
      var s = raw
        .replace(/^https?:\/\//i, "")
        .replace(/^www\./i, "")
        .split("/")[0]
        .toLowerCase();
      return s;
    }
  }

  function findScriptSrc() {
    // Prefer currentScript
    if (document.currentScript && document.currentScript.src) return document.currentScript.src;

    // Fallback: search last matching script
    var scripts = document.getElementsByTagName("script");
    for (var i = scripts.length - 1; i >= 0; i--) {
      var src = scripts[i] && scripts[i].src;
      if (!src) continue;
      if (src.indexOf("/widgets/inrcy-actus.js") !== -1) return src;
    }
    return "";
  }

  function inferAppOrigin() {
    var src = findScriptSrc();
    if (src) {
      try {
        return new URL(src).origin;
      } catch (e) {}
    }
    // Absolute fallback (prod)
    return "https://app.inrcy.com";
  }

  function showError(container, message) {
    container.innerHTML = "<div style=\"font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#c0392b;font-size:14px;\">" +
      message +
      "</div>";
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function render(container, title, articles) {
    var html = "";
    if (title) {
      html += "<div style=\"font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-weight:700;font-size:18px;margin:0 0 10px 0;\">" +
        escapeHtml(title) +
        "</div>";
    }

    if (!articles || !articles.length) {
      html += "<div style=\"font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#555;font-size:14px;\">Aucune actu pour le moment.</div>";
      container.innerHTML = html;
      return;
    }

    html += "<div style=\"display:grid;gap:10px;\">";
    for (var i = 0; i < articles.length; i++) {
      var a = articles[i];
      var t = a && a.title ? a.title : "";
      var c = a && a.content ? a.content : "";
      html += "<div style=\"border:1px solid rgba(0,0,0,0.08);border-radius:12px;padding:12px;background:#fff;\">";
      html += "<div style=\"font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-weight:700;margin:0 0 6px 0;\">" + escapeHtml(t) + "</div>";
      html += "<div style=\"font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#333;font-size:14px;line-height:1.4;\">" + escapeHtml(c) + "</div>";
      html += "</div>";
    }
    html += "</div>";

    container.innerHTML = html;
  }

  // --- main
  var containers = document.querySelectorAll("[data-inrcy-actus]");
  if (!containers || !containers.length) return;

  var appOrigin = inferAppOrigin();

  for (var i = 0; i < containers.length; i++) {
    (function (container) {
      try {
        var domain = normalizeDomain(container.getAttribute("data-domain") || "");
        var source = (container.getAttribute("data-source") || "").trim();
        var limit = parseInt(container.getAttribute("data-limit") || "5", 10);
        var title = container.getAttribute("data-title") || "";

        if (!domain) {
          showError(container, "Widget iNrCy : domaine manquant (data-domain). ");
          return;
        }
        if (!source) {
          showError(container, "Widget iNrCy : source manquante (data-source). ");
          return;
        }
        if (!isFinite(limit) || limit <= 0) limit = 5;

        var url = appOrigin + "/api/widgets/actus?domain=" + encodeURIComponent(domain) +
          "&source=" + encodeURIComponent(source) +
          "&limit=" + encodeURIComponent(String(limit));

        fetch(url, { method: "GET", mode: "cors" })
          .then(function (r) {
            if (!r.ok) throw new Error("HTTP " + r.status);
            return r.json();
          })
          .then(function (data) {
            if (!data || data.ok !== true) {
              throw new Error((data && data.error) ? data.error : "Réponse invalide");
            }
            render(container, title, data.articles || []);
          })
          .catch(function (err) {
            showError(container, "Widget iNrCy : impossible de charger les actus (" + escapeHtml(String(err && err.message ? err.message : err)) + ").");
          });
      } catch (e) {
        showError(container, "Widget iNrCy : erreur d'initialisation.");
      }
    })(containers[i]);
  }
})();
