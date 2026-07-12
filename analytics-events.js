/* ACR Automobile — GA4 event tracking (gtag). Loaded globally on every page
   (referenced before </body> on every page). The gtag base config lives in
   each page's <head>; this file only adds the event layer. */
(function () {
  function sendGAEvent(eventName, params) {
    if (typeof window.gtag === "function") {
      window.gtag("event", eventName, {
        page_location: window.location.href,
        page_title: document.title,
        ...params
      });
    }
  }

  const firedEvents = new Set();

  function fireOnce(key, eventName, params) {
    if (firedEvents.has(key)) return;
    firedEvents.add(key);
    sendGAEvent(eventName, params);
  }

  document.addEventListener("click", function (event) {
    const link = event.target.closest("a, button");
    if (!link) return;

    const href = link.getAttribute("href") || "";
    const text = (link.innerText || link.getAttribute("aria-label") || "").toLowerCase();

    if (href.includes("wa.me") || href.includes("api.whatsapp.com") || text.includes("whatsapp")) {
      fireOnce("whatsapp_click_" + window.location.pathname, "whatsapp_click", {
        contact_method: "whatsapp"
      });
    }

    if (href.startsWith("tel:")) {
      fireOnce("phone_click_" + window.location.pathname, "phone_click", {
        contact_method: "phone"
      });
    }

    if (href.startsWith("mailto:") || text.includes("email")) {
      fireOnce("email_click_" + window.location.pathname, "email_click", {
        contact_method: "email"
      });
    }

    if (text.includes("security assessment") || text.includes("free assessment")) {
      fireOnce("security_assessment_click_" + window.location.pathname, "security_assessment_click", {
        button_type: "security_assessment"
      });
    }
  });

  document.addEventListener("blur", function (event) {
    const field = event.target;
    if (!field || !field.matches("input[type='email'], input[name*='email'], input[placeholder*='email' i]")) return;

    if (field.value && field.value.includes("@")) {
      fireOnce("email_entered_" + window.location.pathname, "email_entered", {
        field_type: "email"
      });
    }
  }, true);

  document.addEventListener("submit", function (event) {
    const form = event.target;
    if (!form || !form.matches("form")) return;

    fireOnce("generate_lead_" + window.location.pathname, "generate_lead", {
      lead_source: "website_form",
      form_id: form.id || "unknown_form",
      form_name: form.getAttribute("name") || "unknown_form"
    });
  });

  // ACR's forms (homepage wiz.js, form.js) deliver via JavaScript (WhatsApp /
  // email) and do NOT emit a native `submit` event — so the listener above never
  // fires for them. Also fire generate_lead (same dedup key, so it can't double
  // count) when a form's success panel becomes visible, i.e. a real submission.
  function watchLeadPanel(el) {
    const formEl = (el.closest && el.closest("form")) ||
                   (el.parentElement && el.parentElement.querySelector("form"));
    const mo = new MutationObserver(function () {
      if (el.style.display && el.style.display !== "none") {
        fireOnce("generate_lead_" + window.location.pathname, "generate_lead", {
          lead_source: "website_form",
          form_id: (formEl && formEl.id) || el.id || "unknown_form",
          form_name: (formEl && formEl.getAttribute("name")) || "unknown_form"
        });
        mo.disconnect();
      }
    });
    mo.observe(el, { attributes: true, attributeFilter: ["style"] });
  }
  function initLeadPanels() {
    document.querySelectorAll("[data-wiz-ok], #formOk, #dashOk, #conciergeOk")
      .forEach(watchLeadPanel);
  }
  if (document.readyState !== "loading") initLeadPanels();
  else document.addEventListener("DOMContentLoaded", initLeadPanels);
})();
