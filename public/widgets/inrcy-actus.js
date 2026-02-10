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
    // If Supabase returns a Postgres text[] as a string like "{a,b}" (rare here), try to parse minimally
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

    // Local CSS (no dependencies)
    html +=
      "<style>" +
      ".inrcy-actus-wrap{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}" +
      ".inrcy-actus-title{font-weight:800;font-size:20px;margin:0 0 12px 0}" +
      ".inrcy-actus-grid{display:grid;gap:12px}" +
      ".inrcy-actus-card{background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:16px;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,.06)}" +
      ".inrcy-actus-media{width:100%;aspect-ratio:16/9;object-fit:cover;display:block;background:#f3f3f3}" +
      ".inrcy-actus-body{padding:14px 14px 16px 14px}" +
      ".inrcy-actus-h{font-weight:800;font-size:16px;margin:0 0 6px 0}" +
      ".inrcy-actus-meta{font-size:12px;color:#666;margin:0 0 10px 0}" +
      ".inrcy-actus-content{font-size:14px;line-height:1.55;color:#222}" +
      "</style>";

    html += '<div class="inrcy-actus-wrap">';

    if (title) html += '<div class="inrcy-actus-title">' + escapeHtml(title) + "</div>";

    if (!articles || !articles.length) {
      html += '<div style="color:#555;font-size:14px;">Aucune actu pour le moment.</div></div>';
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
      if (img) {
        html += '<img class="inrcy-actus-media" src="' + escapeHtml(img) + '" alt="">';
      }
      html += '<div class="inrcy-actus-body">';
      html += '<h3 class="inrcy-actus-h">' + escapeHtml(t) + "</h3>";
      if (dateTxt) html += '<div class="inrcy-actus-meta">' + escapeHtml(dateTxt) + "</div>";
      html += '<div class="inrcy-actus-content">' + nl2brSafe(c) + "</div>";
      html += "</div></article>";
    }
    html += "</div></div>";

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

        // Optional override
        var endpoint = (container.getAttribute("data-endpoint") || "").trim();
        if (endpoint && endpoint.indexOf("http") !== 0) endpoint = ""; // safety

        if (!domain) {
          showError(container, "Widget iNrCy : domaine manquant (data-domain). ");
          return;
        }
        if (!source) {
          showError(container, "Widget iNrCy : source manquante (data-source). ");
          return;
        }
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
            if (!data || data.ok !== true) {
              throw new Error(data && data.error ? data.error : "Réponse invalide");
            }
            render(container, title, data.articles || []);
          })
          .catch(function (err) {
            showError(
              container,
              "Widget iNrCy : impossible de charger les actus (" +
                escapeHtml(String(err && err.message ? err.message : err)) +
                ")."
            );
          });
      } catch (e) {
        showError(container, "Widget iNrCy : erreur d'initialisation.");
      }
    })(containers[i]);
  }
})();