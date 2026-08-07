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
        const htmlPromises = viewFiles.map(file => fetch(file).then(res => {
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

  document.addEventListener('DOMContentLoaded', function () {
    window.ComponentLoader.loadAllViews();
  });
})();
