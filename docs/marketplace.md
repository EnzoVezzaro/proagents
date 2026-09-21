---
layout: page
sidebar: false
outline: false
head:
  - - meta
    - http-equiv: refresh
      content: "0; url=/studio"
---

<script>
  // The app moved from /marketplace to /studio (Registry/Studio rebrand).
  // Meta-refresh above for no-JS; this keeps hash routes working too.
  if (typeof window !== "undefined") {
    var dest = "/studio";
    var hash = window.location.hash;
    window.location.replace(dest + (hash || ""));
  }
</script>

<div class="pa-mp-head">
  <div class="pa-mp-intro">
    <h1 class="pa-mp-title">Moved</h1>
    <p class="pa-mp-lede">
      The marketplace is now the <a href="/studio">ProAgents Studio</a>.
    </p>
  </div>
</div>
