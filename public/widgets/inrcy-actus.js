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
      return raw
        .toLowerCase()
        .replace(/^https?:\/\//i, "")
        .replace(/^www\./i, "")
        .split("/")[0];
    }
  }

  function findScriptSrc() {
    if (document.currentScript && document.currentScript.src) return document.currentScript.src;

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
    return "https://app.inrcy.com";
  }

  function showError(container, message) {
    container.innerHTML =
      '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#c0392b;font-size:14px;">' +
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

  function nl2brSafe(s) {
    return escapeHtml(s).replace(/\n/g, "<br>");
  }

  function formatDate(iso) {
    try {
      var d = new Date(iso);
      return d.toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" });
    } catch (e) {
      return "";
    }
  }

  function asArray(v) {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    if (typeof v === "string" && v[0] === "{" && v[v.length - 1] === "}") {
      var inner = v.slice(1, -1).trim();
      if (!inner) return [];
      return inner.split(",").map(function (x) {
        return x.replace(/^"+|"+$/g, "");
      });
    }
    return [];
  }

  function render(container, title, articles) {
    var html = "";

    html +=
      "<style>" +
      ".inrcy-actus-wrap{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}" +
      ".inrcy-actus-title{font-weight:900;font-size:22px;letter-spacing:-0.2px;margin:0 0 14px 0}" +
      ".inrcy-actus-grid{display:grid;gap:12px}" +
      ".inrcy-actus-card{position:relative;background:rgba(255,255,255,.92);border:1px solid rgba(0,0,0,.08);border-radius:18px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.08)}" +
      ".inrcy-actus-row{display:flex;gap:14px;padding:14px}" +
      ".inrcy-actus-thumb{flex:0 0 110px;width:110px;height:110px;border-radius:14px;overflow:hidden;background:#f2f2f2;border:1px solid rgba(0,0,0,.06)}" +
      ".inrcy-actus-thumb img{width:100%;height:100%;object-fit:cover;display:block}" +
      ".inrcy-actus-body{min-width:0;flex:1}" +
      ".inrcy-actus-h{font-weight:900;font-size:16px;line-height:1.15;margin:0 0 6px 0;letter-spacing:-0.1px}" +
      ".inrcy-actus-meta{font-size:12px;color:rgba(0,0,0,.55);margin:0 0 8px 0}" +
      ".inrcy-actus-content{font-size:14px;line-height:1.55;color:rgba(0,0,0,.84)}" +
      "@media (max-width:600px){" +
      ".inrcy-actus-row{flex-direction:column}" +
      ".inrcy-actus-thumb{width:100%;height:180px;flex:0 0 auto}" +
      "}" +
      "</style>";

    html += '<div class="inrcy-actus-wrap">';

    if (title) html += '<div class="inrcy-actus-title">' + escapeHtml(title) + "</div>";

    if (!articles || !articles.length) {
      html += '<div style="color:rgba(0,0,0,.7);font-size:14px;">Aucune actu pour le moment.</div></div>';
      container.innerHTML = html;
      return;
    }

    html += '<div class="inrcy-actus-grid">';
    for (var i = 0; i < articles.length; i++) {
      var a = articles[i] || {};
      var t = a.title || "";
      var c = a.content || "";
      var imgs = asArray(a.images);
      var img = imgs.length ? imgs[0] : "";
      var dateTxt = a.created_at ? formatDate(a.created_at) : "";

      html += '<article class="inrcy-actus-card">';
      html += '<div class="inrcy-actus-row">';
      if (img) {
        html += '<div class="inrcy-actus-thumb"><img src="' + escapeHtml(img) + '" alt=""></div>';
      } else {
        html += '<div class="inrcy-actus-thumb" aria-hidden="true"></div>';
      }
      html += '<div class="inrcy-actus-body">';
      html += '<h3 class="inrcy-actus-h">' + escapeHtml(t) + "</h3>";
      if (dateTxt) html += '<div class="inrcy-actus-meta">' + escapeHtml(dateTxt) + "</div>";
      html += '<div class="inrcy-actus-content">' + nl2brSafe(c) + "</div>";
      html += "</div></div></article>";
    }
    html += "</div></div>";

    container.innerHTML = html;
  }

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

        var endpoint = (container.getAttribute("data-endpoint") || "").trim();
        if (endpoint && endpoint.indexOf("http") !== 0) endpoint = "";

        if (!domain) return showError(container, "Widget iNrCy : domaine manquant (data-domain).");
        if (!source) return showError(container, "Widget iNrCy : source manquante (data-source).");
        if (!isFinite(limit) || limit <= 0) limit = 5;

        var url =
          (endpoint || appOrigin + "/api/widgets/actus") +
          "?domain=" +
          encodeURIComponent(domain) +
          "&source=" +
          encodeURIComponent(source) +
          "&limit=" +
          encodeURIComponent(String(limit));

        fetch(url, { method: "GET", mode: "cors" })
          .then(function (r) {
            if (!r.ok) throw new Error("HTTP " + r.status);
            return r.json();
          })
          .then(function (data) {
            if (!data || data.ok !== true) throw new Error((data && data.error) || "Réponse invalide");
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