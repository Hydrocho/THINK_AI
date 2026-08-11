/* ==========================================================================
   Component Loader: Asynchronously loads HTML view templates from views/
   ========================================================================== */

(function () {
  window.ComponentLoader = {
    loadAllViews: async function () {
      const target = document.getElementById('viewContainer');
      if (!target) return;

      const viewFiles = [
        'views/authView.html',
        'views/teacherPendingView.html',
        'views/studentLobbyView.html',
        'views/studentThinkView.html',
        'views/teacherAdminView.html',
        'views/modalsView.html'
      ];

      try {
      const htmlPromises = viewFiles.map(file => fetch(`${file}?v=${Date.now()}`, { cache: 'no-store' }).then(res => {
          if (!res.ok) throw new Error(`Failed to load view ${file}`);
          return res.text();
        }));

        const htmlContents = await Promise.all(htmlPromises);
        target.innerHTML = htmlContents.join('\n');
        console.log("⚡ All 6 Modular View Components Loaded Successfully");

        // Notify App to initialize
        if (window.App && typeof window.App.init === 'function') {
          window.App.init();
        }
      } catch (err) {
        console.error("ComponentLoader error:", err);
      }
    }
  };

  document.addEventListener('DOMContentLoaded', async function () {
    if ('serviceWorker' in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        if (registrations.length) {
          await Promise.all(registrations.map(registration => registration.unregister()));
          if (!sessionStorage.getItem('legacy-service-worker-cleared')) {
            sessionStorage.setItem('legacy-service-worker-cleared', 'true');
            window.location.reload();
            return;
          }
        }
      } catch (_) {}
    }
    sessionStorage.removeItem('legacy-service-worker-cleared');
    window.ComponentLoader.loadAllViews();
  });
})();
