# Plugin Directory

Everything below is loaded live from the
[plugin registry](https://github.com/vcazan/open-screen-deck/blob/main/plugins/registry.json)
— the same index the app's **Plugins → Store** installs from. Install any
of these with one click inside the companion app.

Want to add yours? See the [developer center](develop.md).

<div id="plugin-directory" class="plugin-directory">
  <p class="plugin-directory-status">Loading the registry…</p>
</div>

<script>
(function () {
  var REGISTRY =
    'https://raw.githubusercontent.com/vcazan/open-screen-deck/main/plugins/registry.json';
  var root = document.getElementById('plugin-directory');
  if (!root) return;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  function latestNote(changelog) {
    if (!changelog) return null;
    var versions = Object.keys(changelog).sort(function (a, b) {
      var pa = a.split('.').map(Number), pb = b.split('.').map(Number);
      for (var i = 0; i < 3; i++) {
        if ((pa[i] || 0) !== (pb[i] || 0)) return (pb[i] || 0) - (pa[i] || 0);
      }
      return 0;
    });
    return versions.length ? { version: versions[0], note: changelog[versions[0]] } : null;
  }

  function iconInto(holder, plugin) {
    if (!plugin.icon || !plugin.base) return;
    // Raw hosts serve SVG as text/plain, so fetch and inline as a data URL
    fetch(plugin.base.replace(/\/+$/, '') + '/' + plugin.icon)
      .then(function (r) { return r.ok ? r.text() : null; })
      .then(function (svg) {
        if (!svg || svg.indexOf('<svg') === -1) return;
        var img = document.createElement('img');
        img.alt = '';
        img.src =
          'data:image/svg+xml;base64,' +
          btoa(unescape(encodeURIComponent(svg)));
        holder.textContent = '';
        holder.appendChild(img);
      })
      .catch(function () {});
  }

  fetch(REGISTRY)
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (data) {
      var plugins = (data.plugins || []).filter(function (p) { return p.id; });
      root.textContent = '';

      var count = el('p', 'plugin-directory-status',
        plugins.length + ' plugins in the registry');
      root.appendChild(count);

      var grid = el('div', 'plugin-directory-grid');
      plugins.forEach(function (p) {
        var card = el('article', 'plugin-directory-card');

        var head = el('div', 'pdc-head');
        var icon = el('span', 'pdc-icon', '🧩');
        iconInto(icon, p);
        head.appendChild(icon);
        var id = el('div', 'pdc-id');
        id.appendChild(el('span', 'pdc-name', p.name || p.id));
        id.appendChild(el('span', 'pdc-version',
          'v' + (p.version || '?') + (p.author ? ' · ' + p.author : '')));
        head.appendChild(id);
        card.appendChild(head);

        card.appendChild(el('p', 'pdc-desc', p.description || ''));

        var note = latestNote(p.changelog);
        if (note) {
          var cl = el('p', 'pdc-changelog');
          var v = el('strong', null, 'v' + note.version + ' ');
          cl.appendChild(v);
          cl.appendChild(document.createTextNode(note.note));
          card.appendChild(cl);
        }

        var link = el('a', 'pdc-link', 'Source →');
        link.href =
          'https://github.com/vcazan/open-screen-deck/tree/main/plugins/' + p.id;
        card.appendChild(link);

        grid.appendChild(card);
      });
      root.appendChild(grid);
    })
    .catch(function (err) {
      root.textContent = '';
      root.appendChild(el('p', 'plugin-directory-status',
        'Could not load the registry (' + err.message + ') — browse the ' ));
      var a = el('a', null, 'plugins folder on GitHub');
      a.href = 'https://github.com/vcazan/open-screen-deck/tree/main/plugins';
      root.lastChild.appendChild(a);
      root.lastChild.appendChild(document.createTextNode(' instead.'));
    });
})();
</script>

## Installing

1. Open the companion app → **Plugins** (puzzle icon in the rail)
2. Find the plugin in the **Store** section — click the card for details,
   previews, and the changelog
3. **Install** — its actions appear in the key inspector's action picker
   immediately

Updates are never silent: when a newer version lands in the registry, the
app shows the release notes and asks before installing.

## Community registries

The store's registry URL is configurable (Plugins → Developer), so you can
host your own index anywhere — same JSON shape, any static host.
