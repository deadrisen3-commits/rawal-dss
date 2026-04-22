/* ============================================================
   RAWAL DSS — METHODOLOGY PAGE (Phase 8A)
   Sticky TOC scroll-spy and pipeline status pill.
   ============================================================ */

document.addEventListener('rawal:ready', function (event) {
    const pill = document.getElementById('meth-status-pill');
    if (pill) {
        const meta = event.detail.metadata;
        pill.textContent = 'Pipeline OK · EOL ' + meta.baseline_eol_year;
        pill.classList.add('ok');
    }
});

document.addEventListener('rawal:error', function (event) {
    const pill = document.getElementById('meth-status-pill');
    if (pill) {
        pill.textContent = 'Pipeline data not loaded';
        pill.classList.add('error');
    }
});

/* ============================================================
   Scroll-spy — highlight the TOC link for the section currently
   in view. Uses IntersectionObserver for efficiency.
   ============================================================ */
document.addEventListener('DOMContentLoaded', function () {
    const articles = document.querySelectorAll('.meth-article');
    const tocLinks = document.querySelectorAll('.toc-link');

    if (!articles.length || !tocLinks.length) return;

    function setActive(id) {
        tocLinks.forEach(function (link) {
            link.classList.toggle('active',
                link.getAttribute('href') === '#' + id);
        });
    }

    const observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                setActive(entry.target.id);
            }
        });
    }, {
        rootMargin: '-20% 0px -70% 0px',
        threshold: 0
    });

    articles.forEach(function (article) { observer.observe(article); });

    // Smooth scroll on TOC click
    tocLinks.forEach(function (link) {
        link.addEventListener('click', function (e) {
            const targetId = link.getAttribute('href').substring(1);
            const target = document.getElementById(targetId);
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                setActive(targetId);
            }
        });
    });
});